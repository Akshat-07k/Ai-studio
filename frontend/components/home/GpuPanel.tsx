'use client';

import { GpuMeter } from '@/components/shell/GpuMeter';
import type { AppSettings, ComfyStatus, GpuStats, LlmStatus } from '@/lib/types/system';

export function GpuPanel({
  gpu,
  comfy,
  llm,
  gpuMode,
  onModeChange,
}: {
  gpu: GpuStats | null;
  comfy: ComfyStatus | null;
  llm: LlmStatus | null;
  gpuMode: AppSettings['gpuMode'] | undefined;
  onModeChange: (mode: AppSettings['gpuMode']) => void;
}) {
  return (
    <section className="panel">
      <h2>Sharing one GPU</h2>
      <p className="muted">
        Your graphics card has about 8 GB of video memory (VRAM). An SDXL checkpoint needs around 7 GB, and a 9B
        chat model with a 64K context needs about the same, so only one of them fits at a time.
      </p>

      <GpuMeter gpu={gpu} />

      <div className="occupants">
        <div>
          <span className={`dot ${comfy?.state === 'ready' ? 'green' : 'grey'}`} /> Image engine{' '}
          <span className="muted">{comfy?.state === 'ready' ? 'running (loads models when generating)' : 'not running'}</span>
        </div>
        <div>
          <span className={`dot ${llm?.state === 'ready' ? 'green' : llm?.state === 'starting' ? 'amber pulse' : 'grey'}`} />{' '}
          Chat model{' '}
          <span className="muted">
            {llm?.state === 'ready' ? 'loaded in VRAM' : llm?.state === 'starting' ? 'loading…' : 'not loaded'}
          </span>
        </div>
      </div>

      <div className="mode-options">
        <label className={`mode ${gpuMode === 'auto' ? 'active' : ''}`}>
          <input type="radio" name="gpu-mode" checked={gpuMode === 'auto'} onChange={() => onModeChange('auto')} />
          <span>
            <strong>Auto-swap</strong> <span className="badge-rec">recommended</span>
            <span className="hint block">
              Generating an image unloads the chat model first. Sending a chat message unloads the image models
              first. Each swap costs a few seconds.
            </span>
          </span>
        </label>
        <label className={`mode ${gpuMode === 'manual' ? 'active' : ''}`}>
          <input type="radio" name="gpu-mode" checked={gpuMode === 'manual'} onChange={() => onModeChange('manual')} />
          <span>
            <strong>Manual</strong>
            <span className="hint block">
              Nothing is unloaded automatically; use the Free VRAM / Unload buttons yourself. If both are loaded,
              things get very slow or run out of memory.
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
