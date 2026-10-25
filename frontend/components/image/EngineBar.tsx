'use client';

import { formatBytes, gpuName } from '@/lib/format';
import type { ComfyStatus } from '@/lib/types/system';

/** Image engine (ComfyUI) status + controls, shown at the top of the Image Studio. */
export function EngineBar({
  engine,
  onStart,
  onStop,
  onFree,
  onLogs,
}: {
  engine: ComfyStatus | null;
  onStart: () => void;
  onStop: () => void;
  onFree: () => void;
  onLogs: () => void;
}) {
  if (!engine) {
    return (
      <div className="engine-bar">
        <span className="dot grey" />
        <span className="engine-text muted">Connecting…</span>
      </div>
    );
  }

  const where = engine.managed ? `headless ${engine.url?.replace('http://', '')}` : `attached to ${engine.url?.replace('http://', '')}`;

  return (
    <div className="engine-bar">
      {engine.state === 'ready' && (
        <>
          <span className="dot green" />
          <span className="engine-text">
            ComfyUI {engine.comfyVersion} <span className="muted">· {where}</span>
            {engine.device && (
              <span className="muted">
                {' '}
                · {gpuName(engine.device.name)} · {formatBytes(engine.device.vramFree)} free
              </span>
            )}
          </span>
          <button className="btn small" onClick={onFree} title="Unload image models from GPU memory">
            Free VRAM
          </button>
          {engine.managed && (
            <button className="btn small" onClick={onStop} title="Shut down the headless engine and release all GPU memory">
              Stop engine
            </button>
          )}
        </>
      )}
      {engine.state === 'starting' && (
        <>
          <span className="dot amber pulse" />
          <span className="engine-text">Starting ComfyUI engine… (first start takes ~30s)</span>
        </>
      )}
      {engine.state === 'stopped' && (
        <>
          <span className="dot grey" />
          <span className="engine-text">Image engine stopped</span>
          {engine.canSpawn && (
            <button className="btn small primary" onClick={onStart}>
              Start engine
            </button>
          )}
        </>
      )}
      {engine.state === 'error' && (
        <>
          <span className="dot red" />
          <span className="engine-text error">{engine.error}</span>
          {engine.canSpawn && (
            <button className="btn small primary" onClick={onStart}>
              Start headless engine
            </button>
          )}
        </>
      )}
      <button className="btn small ghost" onClick={onLogs}>
        Logs
      </button>
    </div>
  );
}
