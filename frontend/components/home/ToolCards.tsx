'use client';

import Link from 'next/link';
import { imageUrl } from '@/lib/api';
import { displayName, formatBytes, formatContext, timeAgo } from '@/lib/format';
import { ACTIVE_CHAT_KEY } from '@/lib/storageKeys';
import type { Overview } from '@/lib/api';
import type { ComfyStatus, EngineState, LlmStatus } from '@/lib/types/system';

const DOT: Record<EngineState, string> = { ready: 'green', starting: 'amber pulse', stopped: 'grey', error: 'red' };

function StatusLine({ state, text }: { state: EngineState; text: string }) {
  return (
    <div className="status-line">
      <span className={`dot ${DOT[state]}`} />
      <span>{text}</span>
    </div>
  );
}

function comfyText(c: ComfyStatus) {
  if (c.state === 'ready') return c.managed ? 'Engine ready (running headless)' : 'Engine ready (attached to ComfyUI Desktop)';
  if (c.state === 'starting') return 'Engine starting…';
  if (c.state === 'stopped') return 'Engine stopped';
  return c.error ?? 'Engine error';
}

function llmText(l: LlmStatus) {
  if (!l.available) return 'llama-server.exe not found';
  if (l.state === 'ready') return `Loaded on the GPU · ${formatContext(l.loaded?.contextSize)} context`;
  if (l.state === 'starting') return 'Loading model…';
  if (l.state === 'stopped') return 'Not loaded, loads when you send a message';
  return l.error ?? 'Error';
}

export function ImageCard({ overview, comfy }: { overview: Overview | null; comfy: ComfyStatus | null }) {
  const images = overview?.images;
  return (
    <article className="tool-card">
      <div className="tool-head">
        <div className="tool-icon image">◐</div>
        <div>
          <h2>Image Studio</h2>
          <p className="muted small">Stable Diffusion XL · ComfyUI engine</p>
        </div>
      </div>
      <p>
        Pick a checkpoint, stack LoRAs, write a prompt and watch the picture form step by step. It uses ComfyUI&apos;s
        engine without its node editor: the app builds the node graph for you.
      </p>
      <div className="facts">
        <span>
          <strong>{images?.checkpoints ?? '–'}</strong> checkpoints
        </span>
        <span>
          <strong>{images?.loras ?? '–'}</strong> LoRAs
        </span>
        <span>
          <strong>{images?.total ?? '–'}</strong> images made
        </span>
      </div>
      {comfy && <StatusLine state={comfy.state} text={comfyText(comfy)} />}
      {!!images?.recent.length && (
        <div className="recent-images">
          {images.recent.slice(0, 4).map((job) => (
            <img key={job.id} src={imageUrl(job.images[0])} alt={job.params.positive} title={job.params.positive} loading="lazy" />
          ))}
        </div>
      )}
      <Link href="/image" className="btn primary">
        Open Image Studio →
      </Link>
    </article>
  );
}

export function ChatCard({
  overview,
  llm,
  onLoad,
  onUnload,
}: {
  overview: Overview | null;
  llm: LlmStatus | null;
  onLoad: () => void;
  onUnload: () => void;
}) {
  const model = overview?.llmModels.find((m) => m.file === (llm?.loaded?.model ?? llm?.selectedModel));
  return (
    <article className="tool-card">
      <div className="tool-head">
        <div className="tool-icon chat">◆</div>
        <div>
          <h2>Chat</h2>
          <p className="muted small">Local LLM · llama.cpp server</p>
        </div>
      </div>
      <p>
        Talk to {model ? displayName(model.file) : 'your local model'}. Replies stream word by word, it can show its
        step-by-step thinking, and every conversation is saved on this PC.
      </p>
      <div className="facts">
        <span>
          <strong>{model ? formatBytes(model.sizeBytes) : '–'}</strong> model file
        </span>
        <span>
          <strong>{formatContext(llm?.settings.contextSize)}</strong> context
        </span>
        <span>
          <strong>{overview?.chats.total ?? '–'}</strong> chats
        </span>
      </div>
      {llm && <StatusLine state={llm.state} text={llmText(llm)} />}
      {!!overview?.chats.recent.length && (
        <ul className="recent-chats">
          {overview.chats.recent.slice(0, 3).map((c) => (
            <li key={c.id}>
              <Link href="/chat" onClick={() => localStorage.setItem(ACTIVE_CHAT_KEY, c.id)}>
                {c.title}
              </Link>
              <span className="muted small">{timeAgo(c.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="row-actions">
        <Link href="/chat" className="btn primary">
          Open Chat →
        </Link>
        {llm?.state === 'ready' ? (
          <button className="btn" onClick={onUnload}>
            Unload model
          </button>
        ) : (
          llm?.available &&
          llm.state !== 'starting' && (
            <button className="btn" onClick={onLoad}>
              Load model now
            </button>
          )
        )}
      </div>
    </article>
  );
}
