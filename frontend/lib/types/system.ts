export type EngineState = 'stopped' | 'starting' | 'ready' | 'error';

export interface ComfyStatus {
  mode: 'auto' | 'attach' | 'spawn';
  state: EngineState;
  url: string | null;
  managed: boolean;
  canSpawn: boolean;
  error: string | null;
  comfyVersion: string | null;
  device: { name: string; vramTotal: number; vramFree: number } | null;
}

export type GpuLayers = 'auto' | 'all' | number;

export interface LlmSettings {
  model: string;
  contextSize: number;
  gpuLayers: GpuLayers;
}

export interface LlmStatus {
  state: EngineState;
  error: string | null;
  url: string;
  managed: boolean;
  available: boolean;
  serverPath: string | null;
  modelsDir: string;
  selectedModel: string | null;
  loaded: { model: string; contextSize: number | null; gpuLayers: GpuLayers | 'unknown' } | null;
  settings: LlmSettings;
}

export interface GpuStats {
  name: string;
  totalMb: number;
  usedMb: number;
  freeMb: number;
  utilization: number;
  temperature: number;
}

export interface AppSettings {
  gpuMode: 'auto' | 'manual';
  llm: LlmSettings;
}

export interface LlmModel {
  file: string;
  sizeBytes: number;
}

export interface Notice {
  kind: 'info' | 'error' | 'success';
  text: string;
}
