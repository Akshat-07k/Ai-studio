import { request } from './client';
import type { LlmModel, LlmSettings, LlmStatus } from '../types/system';

export const llmApi = {
  status: () => request<LlmStatus>('/api/llm'),
  models: () => request<LlmModel[]>('/api/llm/models'),
  logs: () => request<{ lines: string[] }>('/api/llm/logs'),
  /** Saves any given settings, then (re)loads the model. */
  start: (settings?: Partial<LlmSettings>) => request<LlmStatus>('/api/llm/start', { method: 'POST', body: settings ?? {} }),
  stop: () => request<LlmStatus>('/api/llm/stop', { method: 'POST' }),
  saveSettings: (settings: Partial<LlmSettings>) => request<LlmStatus>('/api/llm/settings', { method: 'PUT', body: settings }),
};
