'use client';

import { useEffect, useRef } from 'react';

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a limit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (!streaming) ref.current?.focus();
  }, [streaming]);

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder="Message the model…"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!streaming && value.trim()) onSend();
            }
          }}
        />
        {streaming ? (
          <button className="btn danger" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button className="btn primary" onClick={onSend} disabled={disabled || !value.trim()}>
            Send
          </button>
        )}
      </div>
      <p className="composer-hint muted">Enter to send · Shift + Enter for a new line · runs locally, nothing leaves your PC</p>
    </div>
  );
}
