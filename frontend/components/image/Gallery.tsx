'use client';

import { imageUrl } from '@/lib/api';
import { displayName } from '@/lib/format';
import type { Job } from '@/lib/types/image';

export function QueueStrip({ jobs, onSelect, onCancel }: { jobs: Job[]; onSelect: (id: string) => void; onCancel: (id: string) => void }) {
  if (!jobs.length) return null;
  return (
    <div className="queue">
      <span className="muted small">Queue</span>
      {jobs.map((job, i) => (
        <div key={job.id} className={`queue-item ${job.status}`}>
          <button className="link-btn" onClick={() => onSelect(job.id)} title={job.params.positive}>
            {job.status === 'running' ? '▶' : `#${i + 1}`} {job.params.positive.slice(0, 32)}
            {job.params.positive.length > 32 ? '…' : ''}
          </button>
          <button className="icon-btn" title="Cancel" onClick={() => onCancel(job.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Gallery({
  jobs,
  selectedId,
  onSelect,
  onRemove,
}: {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="gallery-wrap">
      <header className="section-head">
        <h2>History</h2>
        <span className="muted small">{jobs.length} generations</span>
      </header>
      {!jobs.length && <p className="muted small">Your generated images will show up here.</p>}
      <div className="gallery">
        {jobs.map((job) => (
          <div key={job.id} className={`tile ${job.id === selectedId ? 'active' : ''}`}>
            <button className="tile-btn" onClick={() => onSelect(job.id)} title={job.params.positive}>
              <img src={imageUrl(job.images[0])} alt={job.params.positive} loading="lazy" />
              {job.images.length > 1 && <span className="badge">{job.images.length}</span>}
              <span className="tile-caption">{displayName(job.params.checkpoint)}</span>
            </button>
            <button
              className="tile-remove"
              title="Remove from history (the file stays on disk)"
              onClick={() => onRemove(job.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
