'use client';

import { useState } from 'react';
import { timeAgo } from '@/lib/format';
import type { ChatSummary } from '@/lib/types/chat';

export function ChatSidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commit = () => {
    if (editing && draft.trim()) onRename(editing, draft.trim());
    setEditing(null);
  };

  return (
    <aside className="chat-sidebar">
      <button className="btn primary full" onClick={onNew}>
        + New chat
      </button>
      <div className="chat-list">
        {!chats.length && <p className="muted small">No conversations yet.</p>}
        {chats.map((c) => (
          <div key={c.id} className={`chat-item ${c.id === activeId ? 'active' : ''}`} onClick={() => onSelect(c.id)}>
            {editing === c.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <>
                <div className="chat-item-title">{c.title}</div>
                <div className="chat-item-meta muted">
                  {timeAgo(c.updatedAt)} · {c.messageCount} messages
                </div>
                <div className="chat-item-actions">
                  <button
                    className="icon-btn"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft(c.title);
                      setEditing(c.id);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${c.title}"?`)) onDelete(c.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
