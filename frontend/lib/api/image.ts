import { API_URL, request } from './client';
import type { ComfyStatus } from '../types/system';
import type {
  EngineOptions,
  GenerateParams,
  ImageRef,
  InputFile,
  Job,
  LoraInfo,
  LoraMeta,
  SourceImage,
  UploadKind,
} from '../types/image';

export const imageApi = {
  engine: () => request<ComfyStatus>('/api/image/engine'),
  engineLogs: () => request<{ lines: string[] }>('/api/image/engine/logs'),
  startEngine: () => request<ComfyStatus>('/api/image/engine/start', { method: 'POST' }),
  stopEngine: () => request<ComfyStatus>('/api/image/engine/stop', { method: 'POST' }),
  freeMemory: () => request<{ ok: true }>('/api/image/engine/free', { method: 'POST' }),
  options: (fresh = false) => request<EngineOptions>(`/api/image/options${fresh ? '?fresh=1' : ''}`),
  loraMeta: () => request<LoraMeta>('/api/image/loras/meta'),
  saveLoraMeta: (name: string, triggerWords: string) =>
    request<LoraMeta>('/api/image/loras/meta', { method: 'PUT', body: { name, triggerWords } }),
  loraInfo: (name: string) => request<LoraInfo>(`/api/image/loras/info?name=${encodeURIComponent(name)}`),
  /** `png` must already be SDXL-sized (see lib/imageFile.ts). */
  upload: (png: Blob, kind: UploadKind) =>
    request<SourceImage & { type: 'input' }>(`/api/image/upload?kind=${kind}`, { method: 'POST', body: png }),
  generate: (params: GenerateParams) => request<Job>('/api/image/generate', { method: 'POST', body: params }),
  jobs: () => request<{ active: Job[]; history: Job[]; queueRemaining: number }>('/api/image/jobs'),
  cancel: (id: string) => request<Job>(`/api/image/jobs/${id}/cancel`, { method: 'POST' }),
  removeFromHistory: (id: string) => request<{ ok: true }>(`/api/image/history/${id}`, { method: 'DELETE' }),
};

export function imageUrl(img: ImageRef, { download = false } = {}) {
  const qs = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
  if (download) qs.set('download', '1');
  return `${API_URL}/api/image/view?${qs}`;
}

/** URL of an uploaded source image or mask. */
export function inputImageUrl(file: InputFile) {
  return imageUrl({ filename: file.filename, subfolder: file.subfolder, type: 'input' });
}
