'use client';

// Opens ONE Server-Sent Events connection to the backend for the whole app.
// - useSystem() gives the latest engine / GPU / settings state (for the nav bar, Home, etc.)
// - useEvent(name, handler) lets a page react to specific events (image jobs, previews, ...)
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { API_URL } from '@/lib/api';
import type { AppSettings, ComfyStatus, GpuStats, LlmStatus, Notice } from '@/lib/types/system';
import { useToast } from './ToastProvider';

export interface SystemState {
  connection: 'connecting' | 'open' | 'down';
  comfy: ComfyStatus | null;
  llm: LlmStatus | null;
  gpu: GpuStats | null;
  settings: AppSettings | null;
}

// Each event has its own payload type; handlers declare the one they expect.
type Handler = (data: any) => void;

const PAGE_EVENTS = ['open', 'job', 'job-removed', 'preview', 'queue', 'history-removed'];

const EventsContext = createContext<{ state: SystemState; subscribe: (event: string, fn: Handler) => () => void } | null>(
  null
);

export function EventsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [state, setState] = useState<SystemState>({
    connection: 'connecting',
    comfy: null,
    llm: null,
    gpu: null,
    settings: null,
  });
  const listeners = useRef(new Map<string, Set<Handler>>());

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/events`);
    const emit = (name: string, data: unknown) => listeners.current.get(name)?.forEach((fn) => fn(data));
    const on = (name: string, apply?: Handler) =>
      es.addEventListener(name, (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        apply?.(data);
        emit(name, data);
      });

    es.onopen = () => {
      setState((s) => ({ ...s, connection: 'open' }));
      emit('open', null); // pages refetch their data after a (re)connect
    };
    es.onerror = () => setState((s) => ({ ...s, connection: 'down' }));

    on('comfy', (comfy: ComfyStatus) => setState((s) => ({ ...s, comfy })));
    on('llm', (llm: LlmStatus) => setState((s) => ({ ...s, llm })));
    on('gpu', (gpu: GpuStats | null) => setState((s) => ({ ...s, gpu })));
    on('settings', (settings: AppSettings) => setState((s) => ({ ...s, settings })));
    on('notice', (n: Notice) => toast(n.kind, n.text));
    PAGE_EVENTS.filter((n) => n !== 'open').forEach((n) => on(n));

    return () => es.close();
  }, [toast]);

  const subscribe = useCallback((event: string, fn: Handler) => {
    const set = listeners.current.get(event) ?? new Set();
    set.add(fn);
    listeners.current.set(event, set);
    return () => {
      set.delete(fn);
    };
  }, []);

  return <EventsContext.Provider value={{ state, subscribe }}>{children}</EventsContext.Provider>;
}

function useEventsContext() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useSystem/useEvent must be used inside <EventsProvider>');
  return ctx;
}

export function useSystem() {
  return useEventsContext().state;
}

/** Calls `handler` for every `event` from the backend while the component is mounted. */
export function useEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const { subscribe } = useEventsContext();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribe(event, (data) => ref.current(data)), [event, subscribe]);
}
