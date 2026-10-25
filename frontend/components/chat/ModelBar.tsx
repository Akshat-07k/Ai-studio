'use client';

import { displayName, formatContext } from '@/lib/format';
import type { LlmStatus } from '@/lib/types/system';

/** Chat engine (llama-server) status + load/unload, shown above the conversation. */
export function ModelBar({
  llm,
  onLoad,
  onUnload,
  onSettings,
  onLogs,
}: {
  llm: LlmStatus | null;
  onLoad: () => void;
  onUnload: () => void;
  onSettings: () => void;
  onLogs: () => void;
}) {
  const name = displayName(llm?.loaded?.model ?? llm?.selectedModel ?? 'model');

  return (
    <div className="model-bar">
      {!llm && (
        <>
          <span className="dot grey" /> <span className="muted">Connecting…</span>
        </>
      )}
      {llm && !llm.available && (
        <>
          <span className="dot red" />
          <span className="error">llama-server.exe not found. Set LLAMA_SERVER in backend/.env.</span>
        </>
      )}
      {llm?.available && llm.state === 'ready' && (
        <>
          <span className="dot green" />
          <span className="model-text">
            <strong>{name}</strong>
            <span className="muted">
              {' '}
              · {formatContext(llm.loaded?.contextSize)} context · GPU layers {String(llm.loaded?.gpuLayers ?? '?')}
            </span>
          </span>
          <button className="btn small" onClick={onUnload} title="Stop llama-server and free its GPU memory">
            Unload
          </button>
        </>
      )}
      {llm?.available && llm.state === 'starting' && (
        <>
          <span className="dot amber pulse" />
          <span className="model-text">Loading {name} into memory…</span>
        </>
      )}
      {llm?.available && llm.state === 'stopped' && (
        <>
          <span className="dot grey" />
          <span className="model-text">
            <strong>{name}</strong> <span className="muted">· not loaded, it loads automatically when you send a message</span>
          </span>
          <button className="btn small primary" onClick={onLoad}>
            Load now
          </button>
        </>
      )}
      {llm?.available && llm.state === 'error' && (
        <>
          <span className="dot red" />
          <span className="model-text error">{llm.error}</span>
          <button className="btn small primary" onClick={onLoad}>
            Retry
          </button>
        </>
      )}
      <span className="spacer" />
      <button className="btn small ghost" onClick={onLogs}>
        Logs
      </button>
      <button className="btn small" onClick={onSettings}>
        ⚙ Settings
      </button>
    </div>
  );
}
