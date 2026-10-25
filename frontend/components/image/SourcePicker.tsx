'use client';

import { useRef, useState, type DragEvent } from 'react';
import { inputImageUrl } from '@/lib/api';
import type { GenerateParams } from '@/lib/types/image';
import { Field, SliderField } from '@/components/ui/Controls';

type SourceFields = Pick<GenerateParams, 'source' | 'mask' | 'denoise' | 'maskGrow' | 'maskBlur'>;

function denoiseHint(denoise: number) {
  if (denoise < 0.35) return 'small touch-ups';
  if (denoise < 0.65) return 'clear changes, same layout';
  if (denoise < 0.9) return 'big changes, loose layout';
  return 'almost a new image';
}

const clampInt = (value: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(value) || 0)));

/** "Start from an image": upload/drop/paste a picture for img2img, optionally with a painted mask (inpainting). */
export function SourcePicker({
  fields,
  update,
  uploading,
  onFile,
  onEditMask,
}: {
  fields: SourceFields;
  update: (patch: Partial<SourceFields>) => void;
  uploading: boolean;
  onFile: (file: File) => void;
  onEditMask: () => void;
}) {
  const { source, mask, denoise, maskGrow, maskBlur } = fields;
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = () => fileInput.current?.click();
  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
      if (file) onFile(file);
    },
  };

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = ''; // picking the same file again should still fire
      }}
    />
  );

  if (!source) {
    return (
      <>
        {input}
        <button
          type="button"
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onClick={pick}
          disabled={uploading}
          {...dropHandlers}
        >
          {uploading ? <span className="spinner small" /> : <span className="dropzone-icon">⤒</span>}
          <span>{uploading ? 'Preparing image…' : 'Upload an image to change it'}</span>
          <span className="muted small">Click, drop or paste (Ctrl+V), or press “Edit this image” on a result</span>
        </button>
      </>
    );
  }

  return (
    <>
      {input}
      <div className={`source-card ${dragOver ? 'over' : ''}`} {...dropHandlers}>
        <button
          type="button"
          className="source-thumb"
          title={mask ? 'Edit the mask' : 'Paint a mask'}
          onClick={onEditMask}
          style={{ aspectRatio: `${source.width} / ${source.height}` }}
        >
          <img src={inputImageUrl(source)} alt="Source" />
          {mask && <img src={inputImageUrl(mask)} alt="" className="source-mask" />}
          {uploading && (
            <span className="source-busy">
              <span className="spinner small" />
            </span>
          )}
        </button>
        <div className="source-info">
          <strong>{mask ? 'Inpainting' : 'img2img'}</strong>
          <span className="muted small">
            {mask
              ? 'Only the painted area is redrawn; the rest stays pixel-perfect.'
              : 'The whole picture is redrawn, guided by your prompt. Paint a mask to change just one part.'}
          </span>
          <span className="muted small">
            {source.width}×{source.height} (output size)
          </span>
        </div>
      </div>
      <div className="source-actions">
        <button type="button" className="btn small" onClick={onEditMask}>
          {mask ? 'Edit mask' : 'Paint mask'}
        </button>
        {mask && (
          <button type="button" className="btn small ghost" onClick={() => update({ mask: null })}>
            Clear mask
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn small ghost" onClick={pick} disabled={uploading}>
          Replace
        </button>
        <button type="button" className="btn small ghost" onClick={() => update({ source: null, mask: null })}>
          Remove
        </button>
      </div>

      <SliderField
        label="Denoise"
        hint={denoiseHint(denoise)}
        value={denoise}
        min={0.05}
        max={1}
        step={0.05}
        onChange={(value) => update({ denoise: Math.round(value * 100) / 100 })}
      />
      {mask && (
        <div className="row">
          <Field label="Grow mask" hint="px">
            <input
              type="number"
              min={0}
              max={64}
              value={maskGrow}
              onChange={(e) => update({ maskGrow: clampInt(e.target.value, 64) })}
            />
          </Field>
          <Field label="Soft edge" hint="px">
            <input
              type="number"
              min={0}
              max={31}
              value={maskBlur}
              onChange={(e) => update({ maskBlur: clampInt(e.target.value, 31) })}
            />
          </Field>
        </div>
      )}
    </>
  );
}
