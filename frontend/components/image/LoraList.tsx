'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { displayName } from '@/lib/format';
import type { LoraInfo, LoraMeta, LoraParam } from '@/lib/types/image';
import { Select, SliderField } from '@/components/ui/Controls';

export type LoraRow = LoraParam & { key: string };

export function newLoraRow(name: string): LoraRow {
  return { key: crypto.randomUUID(), name, strength: 0.8, clipStrength: null, enabled: true };
}

export function LoraList({
  rows,
  available,
  meta,
  onChange,
  onInsert,
  onSaveTrigger,
}: {
  rows: LoraRow[];
  available: string[];
  meta: LoraMeta;
  onChange: (rows: LoraRow[]) => void;
  onInsert: (text: string) => void;
  onSaveTrigger: (name: string, words: string) => void;
}) {
  const update = (key: string, patch: Partial<LoraRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (!available.length) {
    return <p className="muted small">No LoRAs found. Drop .safetensors files into ComfyUI&apos;s models/loras folder.</p>;
  }

  return (
    <div className="lora-list">
      {rows.map((row) => (
        <LoraItem
          key={row.key}
          row={row}
          available={available}
          triggerWords={meta[row.name]?.triggerWords ?? ''}
          onUpdate={(patch) => update(row.key, patch)}
          onRemove={() => onChange(rows.filter((r) => r.key !== row.key))}
          onInsert={onInsert}
          onSaveTrigger={onSaveTrigger}
        />
      ))}
      <button
        type="button"
        className="btn ghost full"
        disabled={rows.length >= 10}
        onClick={() => {
          const unused = available.find((n) => !rows.some((r) => r.name === n)) ?? available[0];
          onChange([...rows, newLoraRow(unused)]);
        }}
      >
        + Add LoRA
      </button>
    </div>
  );
}

function LoraItem({
  row,
  available,
  triggerWords,
  onUpdate,
  onRemove,
  onInsert,
  onSaveTrigger,
}: {
  row: LoraRow;
  available: string[];
  triggerWords: string;
  onUpdate: (patch: Partial<LoraRow>) => void;
  onRemove: () => void;
  onInsert: (text: string) => void;
  onSaveTrigger: (name: string, words: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(triggerWords);
  const [info, setInfo] = useState<LoraInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => setDraft(triggerWords), [triggerWords, row.name]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInfo(null);
    setInfoError(null);
    api.image
      .loraInfo(row.name)
      .then((i) => !cancelled && setInfo(i))
      .catch((e: Error) => !cancelled && setInfoError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, row.name]);

  const missing = !available.includes(row.name);

  return (
    <div className={`lora ${row.enabled ? '' : 'disabled'}`}>
      <div className="lora-head">
        <input
          type="checkbox"
          title={row.enabled ? 'Disable this LoRA' : 'Enable this LoRA'}
          checked={row.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
        />
        <Select
          value={row.name}
          options={missing ? [row.name, ...available] : available}
          format={(n) => (n === row.name && missing ? `${displayName(n)} (missing)` : displayName(n))}
          onChange={(name) => onUpdate({ name })}
        />
        <button type="button" className={`icon-btn ${open ? 'active' : ''}`} title="Details" onClick={() => setOpen(!open)}>
          ⋯
        </button>
        <button type="button" className="icon-btn" title="Remove" onClick={onRemove}>
          ×
        </button>
      </div>

      <SliderField
        label="Strength"
        value={row.strength}
        min={-2}
        max={2}
        step={0.05}
        onChange={(strength) => onUpdate({ strength })}
      />

      {triggerWords && (
        <div className="trigger-line">
          <span className="chip mono" title="Saved trigger words">
            {triggerWords}
          </span>
          <button type="button" className="link-btn" onClick={() => onInsert(triggerWords)}>
            + add to prompt
          </button>
        </div>
      )}

      {open && (
        <div className="lora-details">
          <label className="check">
            <input
              type="checkbox"
              checked={row.clipStrength === null}
              onChange={(e) => onUpdate({ clipStrength: e.target.checked ? null : row.strength })}
            />
            CLIP strength same as model
          </label>
          {row.clipStrength !== null && (
            <SliderField
              label="CLIP strength"
              value={row.clipStrength}
              min={-2}
              max={2}
              step={0.05}
              onChange={(clipStrength) => onUpdate({ clipStrength })}
            />
          )}

          <div className="field">
            <span className="field-label">
              Trigger words <span className="hint">saved per LoRA</span>
            </span>
            <input
              type="text"
              value={draft}
              placeholder="e.g. nvnCarvingSculptureStyles"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== triggerWords && onSaveTrigger(row.name, draft)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>

          {infoError && <p className="error small">{infoError}</p>}
          {!info && !infoError && <p className="muted small">Reading file metadata…</p>}
          {info && (
            <div className="lora-info small">
              <div>
                <span className="muted">Base model:</span> {info.baseModel ?? 'unknown'}
              </div>
              {info.author && (
                <div>
                  <span className="muted">Author:</span> {info.author}
                </div>
              )}
              {info.triggerPhrase && (
                <div>
                  <span className="muted">Trigger:</span>{' '}
                  <button type="button" className="chip mono" onClick={() => onInsert(info.triggerPhrase!)}>
                    {info.triggerPhrase}
                  </button>
                </div>
              )}
              {info.trainingTags.length > 0 && (
                <div className="tags">
                  <span className="muted">Training tags (click to insert):</span>
                  {info.trainingTags.map((t) => (
                    <button type="button" key={t} className="chip" onClick={() => onInsert(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {info.license && <div className="muted">License: {info.license}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
