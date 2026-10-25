import { API_URL, request } from './client';
import { readSse } from '../sse';
import type { Chat, ChatSettings, ChatSummary, ReplyEvent } from '../types/chat';

async function stream(path: string, body: unknown, onEvent: (e: ReplyEvent) => void, signal: AbortSignal) {
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  await readSse(res.body, (_event, data) => onEvent(data as ReplyEvent));
}

export const chatsApi = {
  list: () => request<ChatSummary[]>('/api/chats'),
  create: (settings?: Partial<ChatSettings>) => request<Chat>('/api/chats', { method: 'POST', body: { settings } }),
  get: (id: string) => request<Chat>(`/api/chats/${id}`),
  update: (id: string, patch: { title?: string; settings?: Partial<ChatSettings> }) =>
    request<Chat>(`/api/chats/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) => request<{ ok: true }>(`/api/chats/${id}`, { method: 'DELETE' }),
  /** Sends a message and streams the reply; abort `signal` to stop generating. */
  send: (id: string, content: string, onEvent: (e: ReplyEvent) => void, signal: AbortSignal) =>
    stream(`/api/chats/${id}/messages`, { content }, onEvent, signal),
  regenerate: (id: string, onEvent: (e: ReplyEvent) => void, signal: AbortSignal) =>
    stream(`/api/chats/${id}/regenerate`, {}, onEvent, signal),
};
