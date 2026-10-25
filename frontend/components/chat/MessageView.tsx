'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { displayName, formatDuration } from '@/lib/format';
import { IMAGE_FORM_KEY } from '@/lib/storageKeys';
import type { ChatMessage } from '@/lib/types/chat';
import { Markdown } from './Markdown';

// Puts a reply into the Image Studio's prompt box. Midjourney-style flags
// (--ar 16:9, --v 6) that LLMs like to add mean nothing to SDXL, so drop them.
function sendToImageStudio(text: string) {
  const prompt = text
    .replace(/\s--[a-z]+(\s+[\w.:]+)?/gi, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  let form: Record<string, unknown> = {};
  try {
    form = JSON.parse(localStorage.getItem(IMAGE_FORM_KEY) ?? '{}') ?? {};
  } catch {
    // start from defaults
  }
  localStorage.setItem(IMAGE_FORM_KEY, JSON.stringify({ ...form, positive: prompt }));
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = open || live;
  const words = text.trim().split(/\s+/).length;
  return (
    <div className={`thinking ${expanded ? 'open' : ''}`}>
      <button className="thinking-toggle" onClick={() => setOpen(!open)} disabled={live}>
        {live ? <span className="pulse">Thinking…</span> : `Thought process · ${words} words`}
        {!live && <span className="chev">{expanded ? '▾' : '▸'}</span>}
      </button>
      {expanded && <div className="thinking-body">{text}</div>}
    </div>
  );
}

export function MessageView({
  message,
  live = false,
  status,
  canRegenerate,
  onRegenerate,
}: {
  message: ChatMessage;
  /** true while this reply is still streaming */
  live?: boolean;
  status?: string | null;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  if (message.role === 'user') {
    return (
      <div className="msg user">
        <div className="bubble">{message.content}</div>
      </div>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const s = message.stats;

  return (
    <div className="msg assistant">
      <div className="msg-author">{message.model ? displayName(message.model) : 'Assistant'}</div>
      {message.reasoning && <Thinking text={message.reasoning} live={live && !message.content} />}
      {message.content && <Markdown text={message.content} />}
      {live && !message.content && !message.reasoning && (
        <div className="typing">
          {status ? <span className="muted">{status}</span> : <span className="dots"><i /><i /><i /></span>}
        </div>
      )}
      {!live && (
        <div className="msg-foot">
          {message.stopped && <span className="chip warn">stopped</span>}
          {message.finishReason === 'length' && <span className="chip warn">hit max tokens</span>}
          {message.error && <span className="chip warn">{message.error}</span>}
          {s && (
            <span className="muted small" title={`Prompt: ${s.promptTokens} tokens at ${s.promptPerSecond} tok/s`}>
              {s.tokensPerSecond} tok/s · {s.completionTokens} tokens · {formatDuration(s.durationMs)}
            </span>
          )}
          <span className="msg-actions">
            {message.content && (
              <button className="link-btn" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            {canRegenerate && (
              <button className="link-btn" onClick={onRegenerate}>
                Regenerate
              </button>
            )}
            {message.content && (
              <button
                className="link-btn"
                title="Open the Image Studio with this text as the prompt"
                onClick={() => {
                  sendToImageStudio(message.content);
                  router.push('/image');
                }}
              >
                Use as image prompt →
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
