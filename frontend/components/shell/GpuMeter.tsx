'use client';

import { formatMb } from '@/lib/format';
import type { GpuStats } from '@/lib/types/system';

/** VRAM usage bar. `compact` is the nav-bar version. */
export function GpuMeter({ gpu, compact = false }: { gpu: GpuStats | null; compact?: boolean }) {
  if (!gpu) return compact ? null : <p className="muted small">GPU stats unavailable (nvidia-smi not found).</p>;
  const pct = Math.min(100, Math.round((gpu.usedMb / gpu.totalMb) * 100));
  const level = pct > 90 ? 'high' : pct > 70 ? 'mid' : 'low';

  if (compact) {
    return (
      <div className="gpu-compact" title={`${gpu.name}\n${gpu.utilization}% busy · ${gpu.temperature}°C`}>
        <span className="muted">VRAM</span>
        <div className={`meter small ${level}`}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <span>
          {formatMb(gpu.usedMb)} <span className="muted">/ {formatMb(gpu.totalMb)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="gpu-full">
      <div className="gpu-head">
        <strong>{gpu.name}</strong>
        <span className="muted small">
          {gpu.utilization}% busy · {gpu.temperature}°C
        </span>
      </div>
      <div className={`meter big ${level}`}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="gpu-legend small">
        <span>
          <strong>{formatMb(gpu.usedMb)}</strong> used
        </span>
        <span>
          <strong>{formatMb(gpu.freeMb)}</strong> free
        </span>
        <span className="muted">{formatMb(gpu.totalMb)} total</span>
      </div>
    </div>
  );
}
