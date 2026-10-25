import { request } from './client';
import type { Job } from '../types/image';
import type { ChatSummary } from '../types/chat';
import type { AppSettings, ComfyStatus, GpuStats, LlmModel, LlmStatus } from '../types/system';

export interface Overview {
  comfy: ComfyStatus;
  llm: LlmStatus;
  llmModels: LlmModel[];
  gpu: GpuStats | null;
  settings: AppSettings;
  images: { total: number; recent: Job[]; checkpoints: number | null; loras: number | null };
  chats: { total: number; recent: ChatSummary[] };
}

export const systemApi = {
  overview: () => request<Overview>('/api/overview'),
  setGpuMode: (gpuMode: AppSettings['gpuMode']) => request<AppSettings>('/api/settings', { method: 'PUT', body: { gpuMode } }),
};
