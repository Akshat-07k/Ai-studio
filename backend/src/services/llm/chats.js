// Conversations with the local LLM: storage, prompt building and streamed replies.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { JsonStore } from '../../utils/store.js';

export const DEFAULT_CHAT_SETTINGS = {
  systemPrompt: 'You are a helpful, concise assistant.',
  temperature: 0.7,
  topP: 0.8,
  maxTokens: 0, // 0 = no limit
  thinking: false,
};

// Rough token estimate (~3.5 characters per token) used to keep history inside the context window.
const estimateTokens = (text) => Math.ceil((text?.length ?? 0) / 3.5) + 4;

function makeTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || 'New chat';
}

export class ChatService extends EventEmitter {
  constructor({ client, engine, gpu, dataDir }) {
    super();
    this.client = client;
    this.engine = engine;
    this.gpu = gpu;
    this.store = new JsonStore(path.join(dataDir, 'chats.json'), { chats: [] });
    this.active = 0; // replies currently streaming
  }

  get activeCount() {
    return this.active;
  }

  get chats() {
    return this.store.data.chats;
  }

  summary(chat) {
    const last = chat.messages.at(-1);
    return {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      preview: last ? last.content.slice(0, 120) : '',
    };
  }

  list() {
    return [...this.chats].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => this.summary(c));
  }

  get(id) {
    const chat = this.chats.find((c) => c.id === id);
    if (!chat) throw new NotFoundError('Chat not found');
    return chat;
  }

  create({ title, settings } = {}) {
    const now = Date.now();
    const chat = {
      id: randomUUID(),
      title: title?.trim() || 'New chat',
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_CHAT_SETTINGS, ...settings },
      messages: [],
    };
    this.chats.push(chat);
    this.store.save();
    return chat;
  }

  update(id, { title, settings }) {
    const chat = this.get(id);
    if (title !== undefined) chat.title = title.trim() || chat.title;
    if (settings) chat.settings = { ...chat.settings, ...settings };
    chat.updatedAt = Date.now();
    this.store.save();
    return chat;
  }

  remove(id) {
    this.get(id);
    this.store.data.chats = this.chats.filter((c) => c.id !== id);
    this.store.save();
  }

  // System prompt + as much recent history as fits in the loaded context window.
  buildMessages(chat) {
    const { systemPrompt, maxTokens } = chat.settings;
    const contextSize = this.engine.loaded?.contextSize || 8192;
    let budget = contextSize - (maxTokens > 0 ? maxTokens : Math.min(4096, contextSize / 4));

    const out = [];
    if (systemPrompt.trim()) {
      out.push({ role: 'system', content: systemPrompt });
      budget -= estimateTokens(systemPrompt);
    }
    const history = [];
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (!m.content) continue; // e.g. a reply stopped while it was still thinking
      budget -= estimateTokens(m.content);
      if (budget < 0 && history.length) break;
      history.unshift({ role: m.role, content: m.content });
    }
    return out.concat(history);
  }

  /**
   * Adds the user's message (or re-answers the last one when `regenerate`), makes sure
   * the model is loaded, then streams the reply. Yields events for the HTTP stream:
   * user, status, start, reasoning, content, done.
   */
  async *reply(chatId, { content, regenerate = false }, signal) {
    const chat = this.get(chatId);
    this.active++;
    try {
      if (regenerate) {
        while (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
        if (!chat.messages.length) throw new ValidationError('There is no message to answer');
      } else {
        if (typeof content !== 'string' || !content.trim()) throw new ValidationError('Message is empty');
        const userMessage = { id: randomUUID(), role: 'user', content, createdAt: Date.now() };
        chat.messages.push(userMessage);
        if (chat.messages.length === 1 && chat.title === 'New chat') chat.title = makeTitle(content);
        chat.updatedAt = Date.now();
        this.store.save();
        yield { type: 'user', message: userMessage, chat: this.summary(chat) };
      }

      // Free the GPU from image generation if needed, then load the model.
      await this.gpu.prepareForLlm();
      if (this.engine.state !== 'ready') {
        const name = (this.engine.selectedModel() ?? 'the model').replace(/\.gguf$/i, '');
        yield { type: 'status', text: `Loading ${name} into memory…` };
        await this.engine.ensureRunning();
      }

      const assistant = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        reasoning: '',
        createdAt: Date.now(),
        model: this.engine.loaded?.model ?? null,
        stats: null,
        finishReason: null,
        stopped: false,
        error: null,
      };
      yield { type: 'start', messageId: assistant.id, model: assistant.model };

      const { temperature, topP, maxTokens, thinking } = chat.settings;
      const startedAt = Date.now();
      try {
        const stream = this.client.streamChat(
          {
            messages: this.buildMessages(chat),
            temperature,
            top_p: topP,
            ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
            chat_template_kwargs: { enable_thinking: thinking },
          },
          signal
        );
        for await (const chunk of stream) {
          if (chunk.reasoning) {
            assistant.reasoning += chunk.reasoning;
            yield { type: 'reasoning', delta: chunk.reasoning };
          }
          if (chunk.content) {
            assistant.content += chunk.content;
            yield { type: 'content', delta: chunk.content };
          }
          if (chunk.finishReason) assistant.finishReason = chunk.finishReason;
          if (chunk.timings) {
            const t = chunk.timings;
            assistant.stats = {
              promptTokens: t.prompt_n,
              completionTokens: t.predicted_n,
              tokensPerSecond: Math.round(t.predicted_per_second * 10) / 10,
              promptPerSecond: Math.round(t.prompt_per_second),
              durationMs: Date.now() - startedAt,
            };
          }
        }
      } catch (err) {
        if (signal?.aborted) assistant.stopped = true;
        else if (!assistant.content && !assistant.reasoning) throw err;
        else assistant.error = err.message;
      }

      if (assistant.content || assistant.reasoning) {
        chat.messages.push(assistant);
        chat.updatedAt = Date.now();
        this.store.save();
      }
      yield { type: 'done', message: assistant, chat: this.summary(chat) };
    } finally {
      this.active--;
    }
  }

  flush() {
    this.store.flush();
  }
}
