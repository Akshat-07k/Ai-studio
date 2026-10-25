'use client';

import { useEffect, useState } from 'react';
import { imageUrl, inputImageUrl } from '@/lib/api';
import { displayName, formatDuration } from '@/lib/format';
import type { ImageRef, Job } from '@/lib/types/image';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function Stage({
  job,
  preview,
  queuePosition,
  onCancel,
  onReuse,
  onUseSeed,
  onOpen,
  onEdit,
  editing,
}: {
  job: Job | null;
  preview: string | null;
  queuePosition: number;
  onCancel: (id: string) => void;
  onReuse: (job: Job) => void;
  onUseSeed: (seed: number) => void;
  onOpen: (url: string) => void;
  /** use this result as the source image for img2img / inpainting */
  onEdit: (image: ImageRef) => void;
  editing: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [comparing, setComparing] = useState(false);
  const running = job?.status === 'running';
  const now = useNow(running);

  useEffect(() => {
    setIndex(0);
    setComparing(false);
  }, [job?.id]);

  if (!job) {
    return (
      <div className="stage empty">
        <div className="empty-hint">
          <div className="empty-icon">◐</div>
          <p>Pick a checkpoint, add LoRAs if you like, write a prompt and hit Generate.</p>
          <p className="muted small">
            To change an existing picture, upload it under “Start from an image”. Ctrl + Enter in the prompt box also
            generates.
          </p>
        </div>
      </div>
    );
  }

  const { params } = job;
  const image = job.images[index] ?? job.images[0];
  const pct = job.progress ? Math.round((job.progress.value / job.progress.max) * 100) : null;
  const elapsed = job.startedAt ? (job.finishedAt ?? now) - job.startedAt : null;

  return (
    <div className="stage">
      <div className="stage-canvas">
        {job.status === 'done' && image && (
          <img
            src={imageUrl(image)}
            alt={params.positive}
            className="stage-img clickable"
            onClick={() => onOpen(imageUrl(image))}
          />
        )}
        {comparing && params.source && (
          <img src={inputImageUrl(params.source)} alt="Source image" className="stage-img" />
        )}
        {comparing && <span className="compare-label">Original</span>}
        {(job.status === 'running' || job.status === 'queued') && (
          <>
            {preview ? (
              <img src={preview} alt="Live preview" className="stage-img preview" />
            ) : (
              <div className="stage-placeholder">
                <div className="spinner" />
              </div>
            )}
            <div className="stage-overlay">
              <div className="phase">
                {job.status === 'queued'
                  ? queuePosition > 0
                    ? `Waiting in queue (#${queuePosition})`
                    : 'Queued'
                  : job.phase}
                {job.progress && ` · step ${job.progress.value}/${job.progress.max}`}
                {elapsed !== null && <span className="muted"> · {formatDuration(elapsed)}</span>}
              </div>
              <div className="progress">
                <div
                  key={pct === null ? 'indeterminate' : 'determinate'}
                  className={`progress-fill ${pct === null ? 'indeterminate' : ''}`}
                  style={pct !== null ? { width: `${pct}%` } : undefined}
                />
              </div>
              <button className="btn small danger" onClick={() => onCancel(job.id)}>
                Cancel
              </button>
            </div>
          </>
        )}
        {job.status === 'error' && (
          <div className="stage-placeholder">
            <div className="error-box">
              <strong>Generation failed</strong>
              <p>{job.error}</p>
            </div>
          </div>
        )}
        {job.status === 'cancelled' && (
          <div className="stage-placeholder">
            <p className="muted">Cancelled</p>
          </div>
        )}
      </div>

      {job.images.length > 1 && (
        <div className="thumbs">
          {job.images.map((img, i) => (
            <button key={img.filename} className={`thumb ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)}>
              <img src={imageUrl(img)} alt={`Image ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="stage-meta">
        <p className="prompt-text">{params.positive}</p>
        <div className="meta-chips">
          {params.source && (
            <span className="chip accent">
              {params.mask ? 'inpaint' : 'img2img'} · denoise {params.denoise}
            </span>
          )}
          <span className="chip">{displayName(params.checkpoint)}</span>
          {params.loras.map((l) => (
            <span className="chip accent" key={l.name}>
              {displayName(l.name)} {l.strength}
            </span>
          ))}
          <span className="chip">
            {params.width}×{params.height}
          </span>
          <span className="chip">{params.steps} steps</span>
          <span className="chip">CFG {params.cfg}</span>
          <span className="chip">
            {params.sampler} / {params.scheduler}
          </span>
          {params.clipSkip > 1 && <span className="chip">clip skip {params.clipSkip}</span>}
          <span className="chip mono">seed {params.seed}</span>
          {job.status === 'done' && elapsed !== null && <span className="chip">{formatDuration(elapsed)}</span>}
        </div>
        <div className="stage-actions">
          <button className="btn small" onClick={() => onReuse(job)}>
            Reuse settings
          </button>
          <button className="btn small" onClick={() => onUseSeed(params.seed)}>
            Use this seed
          </button>
          {job.status === 'done' && image && (
            <>
              <button
                className="btn small"
                disabled={editing}
                title="Use this result as the source image, to change it further"
                onClick={() => onEdit(image)}
              >
                {editing ? 'Loading…' : 'Edit this image'}
              </button>
              {params.source && (
                <button
                  className="btn small"
                  title="Hold to show the source image"
                  onPointerDown={() => setComparing(true)}
                  onPointerUp={() => setComparing(false)}
                  onPointerLeave={() => setComparing(false)}
                >
                  Hold to compare
                </button>
              )}
              <a className="btn small" href={imageUrl(image, { download: true })}>
                Download
              </a>
              <a className="btn small ghost" href={imageUrl(image)} target="_blank" rel="noreferrer">
                Open full size
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
