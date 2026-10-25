// Conversations with the local LLM. Sending a message answers with a stream of
// Server-Sent Events (status, reasoning, content, done) instead of plain JSON.
import { Router } from 'express';
import { bool, num, pick, str } from '../utils/validate.js';
import { openSse } from '../utils/sse.js';

const validateChatSettings = (input) =>
  pick(input, {
    systemPrompt: (v) => str(v, 'System prompt', { max: 20_000 }),
    temperature: (v) => num(v, 'Temperature', { min: 0, max: 2 }),
    topP: (v) => num(v, 'Top P', { min: 0, max: 1 }),
    maxTokens: (v) => num(v, 'Max tokens', { min: 0, max: 262_144, integer: true }),
    thinking: (v) => bool(v, 'Thinking'),
  });

// Pipes a reply generator into an SSE response. Closing the browser tab or pressing
// Stop closes the response, which aborts generation upstream.
async function streamReply(res, generator, abort) {
  const stream = openSse(res);
  res.on('close', () => abort.abort());
  try {
    for await (const event of generator) stream.send(event.type, event);
  } catch (err) {
    stream.send('error', { type: 'error', error: err.message, status: err.status ?? 500 });
  } finally {
    stream.end();
  }
}

export function chatRoutes({ llm }) {
  const { chats } = llm;
  const router = Router();

  router.get('/', (req, res) => res.json(chats.list()));

  router.post('/', (req, res) => {
    const title = str(req.body?.title, 'Title', { max: 200 });
    res.status(201).json(chats.create({ title, settings: validateChatSettings(req.body?.settings) }));
  });

  router.get('/:id', (req, res) => res.json(chats.get(req.params.id)));

  router.patch('/:id', (req, res) => {
    const title = req.body?.title === undefined ? undefined : str(req.body.title, 'Title', { max: 200 });
    res.json(chats.update(req.params.id, { title, settings: validateChatSettings(req.body?.settings) }));
  });

  router.delete('/:id', (req, res) => {
    chats.remove(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/messages', async (req, res) => {
    chats.get(req.params.id); // 404 as JSON before the stream starts
    const content = str(req.body?.content, 'Message', { required: true, max: 200_000 });
    const abort = new AbortController();
    await streamReply(res, chats.reply(req.params.id, { content }, abort.signal), abort);
  });

  router.post('/:id/regenerate', async (req, res) => {
    chats.get(req.params.id);
    const abort = new AbortController();
    await streamReply(res, chats.reply(req.params.id, { regenerate: true }, abort.signal), abort);
  });

  return router;
}
