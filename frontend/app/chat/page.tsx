'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Chat, ChatMessage, ChatSettings, ChatSummary, ReplyEvent } from '@/lib/types/chat';
import type { LlmModel, LlmSettings } from '@/lib/types/system';
import { useEvent, useSystem } from '@/components/providers/EventsProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { Composer } from '@/components/chat/Composer';
import { MessageView } from '@/components/chat/MessageView';
import { ModelBar } from '@/components/chat/ModelBar';
import { SettingsPanel } from '@/components/chat/SettingsPanel';
import { LogsDrawer } from '@/components/ui/Overlays';
import { ACTIVE_CHAT_KEY } from '@/lib/storageKeys';

const SUGGESTIONS = [
  'Write a detailed SDXL prompt for a cozy wooden cabin in a snowy forest at night',
  'Explain what a LoRA is, like I am new to AI',
  'What is the difference between CFG and steps in Stable Diffusion?',
  'Give me 5 creative ideas for marble sculpture images',
];

/** The reply currently being streamed. */
interface Streaming {
  chatId: string;
  content: string;
  reasoning: string;
  status: string | null;
  model: string | null;
}

function toSummary(chat: Chat): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
    preview: chat.messages.at(-1)?.content.slice(0, 120) ?? '',
  };
}

export default function ChatPage() {
  const toast = useToast();
  const { llm } = useSystem();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [draft, setDraft] = useState('');
  const [models, setModels] = useState<LlmModel[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // ---------- loading ----------

  const loadChats = useCallback(async () => {
    const list = await api.chats.list();
    setChats(list);
    setActiveId((current) => {
      if (current && list.some((c) => c.id === current)) return current;
      const saved = localStorage.getItem(ACTIVE_CHAT_KEY);
      return list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    loadChats().catch((e: Error) => toast('error', e.message));
    api.llm.models().then(setModels).catch(() => {});
  }, [loadChats, toast]);
  useEvent('open', () => loadChats().catch(() => {}));

  useEffect(() => {
    if (!activeId) {
      setChat(null);
      return;
    }
    localStorage.setItem(ACTIVE_CHAT_KEY, activeId);
    if (chat?.id === activeId) return;
    api.chats
      .get(activeId)
      .then((c) => {
        stickToBottom.current = true;
        setChat(c);
      })
      .catch((e: Error) => toast('error', e.message));
  }, [activeId, chat?.id, toast]);

  // Keep the view pinned to the newest text unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat?.messages.length, streaming?.content, streaming?.reasoning, streaming?.status]);

  const upsertSummary = (summary: ChatSummary) =>
    setChats((list) => [summary, ...list.filter((c) => c.id !== summary.id)]);

  // ---------- streaming ----------

  const runStream = async (
    chatId: string,
    start: (onEvent: (e: ReplyEvent) => void, signal: AbortSignal) => Promise<void>
  ) => {
    const abort = new AbortController();
    abortRef.current = abort;
    stickToBottom.current = true;
    setStreaming({ chatId, content: '', reasoning: '', status: null, model: null });

    const appendMessage = (message: ChatMessage) =>
      setChat((c) => (c && c.id === chatId ? { ...c, messages: [...c.messages, message] } : c));

    const onEvent = (e: ReplyEvent) => {
      switch (e.type) {
        case 'user':
          appendMessage(e.message);
          upsertSummary(e.chat);
          break;
        case 'status':
          setStreaming((s) => s && { ...s, status: e.text });
          break;
        case 'start':
          setStreaming((s) => s && { ...s, status: null, model: e.model });
          break;
        case 'reasoning':
          setStreaming((s) => s && { ...s, reasoning: s.reasoning + e.delta });
          break;
        case 'content':
          setStreaming((s) => s && { ...s, content: s.content + e.delta });
          break;
        case 'done':
          if (e.message.content || e.message.reasoning) appendMessage(e.message);
          upsertSummary(e.chat);
          setStreaming(null);
          break;
        case 'error':
          toast('error', e.error);
          break;
      }
    };

    try {
      await start(onEvent, abort.signal);
    } catch (err) {
      if (abort.signal.aborted) {
        // The server saves the partial reply when we disconnect; fetch it.
        setTimeout(() => api.chats.get(chatId).then((c) => setChat((cur) => (cur?.id === chatId ? c : cur))), 500);
      } else {
        toast('error', (err as Error).message);
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const send = async (text = draft) => {
    const content = text.trim();
    if (!content || streaming) return;
    let target = chat;
    if (!target) {
      try {
        target = await api.chats.create();
      } catch (e) {
        toast('error', (e as Error).message);
        return;
      }
      setChat(target);
      setActiveId(target.id);
      upsertSummary(toSummary(target));
    }
    setDraft('');
    const id = target.id;
    await runStream(id, (onEvent, signal) => api.chats.send(id, content, onEvent, signal));
  };

  const regenerate = async () => {
    if (!chat || streaming) return;
    const id = chat.id;
    setChat((c) => {
      if (!c) return c;
      const messages = [...c.messages];
      while (messages.at(-1)?.role === 'assistant') messages.pop();
      return { ...c, messages };
    });
    await runStream(id, (onEvent, signal) => api.chats.regenerate(id, onEvent, signal));
  };

  // ---------- chat management ----------

  const newChat = async () => {
    stop();
    try {
      const c = await api.chats.create(chat ? { ...chat.settings } : undefined);
      setChat(c);
      setActiveId(c.id);
      upsertSummary(toSummary(c));
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const selectChat = (id: string) => {
    if (id === activeId) return;
    stop();
    setActiveId(id);
  };

  const deleteChat = async (id: string) => {
    try {
      await api.chats.remove(id);
      const rest = chats.filter((c) => c.id !== id);
      setChats(rest);
      if (id === activeId) setActiveId(rest[0]?.id ?? null);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const renameChat = async (id: string, title: string) => {
    try {
      const c = await api.chats.update(id, { title });
      upsertSummary(toSummary(c));
      if (chat?.id === id) setChat({ ...chat, title: c.title });
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  // Settings apply instantly in the UI and are saved shortly after the last change.
  const changeChatSettings = (patch: Partial<ChatSettings>) => {
    if (!chat) return;
    const settings = { ...chat.settings, ...patch };
    setChat({ ...chat, settings });
    clearTimeout(settingsTimer.current);
    const id = chat.id;
    settingsTimer.current = setTimeout(() => {
      api.chats.update(id, { settings }).catch((e: Error) => toast('error', e.message));
    }, 400);
  };

  const applyServerSettings = (settings: LlmSettings) => {
    api.llm
      .start(settings)
      .then(() => {
        setSettingsOpen(false);
        toast('info', 'Loading the model with the new settings…');
      })
      .catch((e: Error) => toast('error', e.message));
  };

  // ---------- render ----------

  const isStreamingHere = streaming && streaming.chatId === chat?.id;
  const lastAssistantId = chat?.messages.at(-1)?.role === 'assistant' ? chat.messages.at(-1)?.id : null;

  return (
    <div className="chat-page">
      <ChatSidebar
        chats={chats}
        activeId={activeId}
        onSelect={selectChat}
        onNew={newChat}
        onDelete={deleteChat}
        onRename={renameChat}
      />

      <section className="chat-main">
        <ModelBar
          llm={llm}
          onLoad={() => api.llm.start().catch((e: Error) => toast('error', e.message))}
          onUnload={() => api.llm.stop().catch((e: Error) => toast('error', e.message))}
          onSettings={() => {
            api.llm.models().then(setModels).catch(() => {}); // pick up newly added .gguf files
            setSettingsOpen(true);
          }}
          onLogs={() => setLogsOpen(true)}
        />

        <div
          className="messages"
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          <div className="messages-inner">
            {!chat?.messages.length && !isStreamingHere && (
              <div className="chat-empty">
                <div className="empty-icon">◆</div>
                <h2>What would you like to talk about?</h2>
                <p className="muted">
                  Everything runs on your GPU with llama.cpp. The first message loads the model, which takes a few
                  seconds.
                </p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggestion" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat?.messages.map((m) => (
              <MessageView
                key={m.id}
                message={m}
                canRegenerate={m.id === lastAssistantId && !streaming}
                onRegenerate={regenerate}
              />
            ))}

            {isStreamingHere && (
              <MessageView
                live
                status={streaming.status}
                message={{
                  id: 'live',
                  role: 'assistant',
                  content: streaming.content,
                  reasoning: streaming.reasoning,
                  model: streaming.model,
                  createdAt: Date.now(),
                }}
              />
            )}
          </div>
        </div>

        <Composer value={draft} onChange={setDraft} onSend={() => send()} onStop={stop} streaming={Boolean(streaming)} />
      </section>

      {settingsOpen && (
        <SettingsPanel
          chatSettings={chat?.settings ?? null}
          onChatSettings={changeChatSettings}
          llm={llm}
          models={models}
          onApplyServer={applyServerSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {logsOpen && <LogsDrawer title="llama-server logs" load={api.llm.logs} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
