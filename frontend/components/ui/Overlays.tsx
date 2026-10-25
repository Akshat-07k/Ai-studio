'use client';

import { useEffect, useRef, useState } from 'react';

/** Side drawer that polls an engine's console output. */
export function LogsDrawer({
  title,
  load,
  emptyText = 'No output yet.',
  onClose,
}: {
  title: string;
  load: () => Promise<{ lines: string[] }>;
  emptyText?: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      load()
        .then((r) => {
          if (!alive) return;
          setLines(r.lines);
          setError(null);
        })
        .catch((e: Error) => alive && setError(e.message));
    refresh();
    const t = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="section-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </header>
        {error && <p className="error small">{error}</p>}
        <pre ref={preRef} className="logs">
          {lines.length ? lines.join('\n') : emptyText}
        </pre>
      </aside>
    </div>
  );
}

export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <img src={url} alt="Full size" />
    </div>
  );
}
