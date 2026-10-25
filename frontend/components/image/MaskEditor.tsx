'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { drawMaskAsStrokes, isMaskEmpty, MASK_COLOR, strokesToMaskPng } from '@/lib/imageFile';

const MAX_UNDO = 10;
type Point = { x: number; y: number };

/**
 * Full-screen editor for painting an inpainting mask over the source image.
 * The canvas has the source's real pixel size and is only scaled for display,
 * so the exported mask lines up 1:1 with the image ComfyUI receives.
 */
export function MaskEditor({
  imageUrl,
  width,
  height,
  maskUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  width: number;
  height: number;
  /** existing mask to keep editing, if any */
  maskUrl: string | null;
  /** null = nothing painted (removes the mask) */
  onSave: (mask: Blob | null) => Promise<void>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const last = useRef<Point | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const maxSize = Math.round(Math.min(width, height) / 3);
  const [size, setSize] = useState(() => Math.round(Math.min(width, height) / 14));
  const [canUndo, setCanUndo] = useState(false);
  const [saving, setSaving] = useState(false);

  const ctx = () => canvasRef.current!.getContext('2d', { willReadFrequently: true })!;

  useEffect(() => {
    if (maskUrl && canvasRef.current) drawMaskAsStrokes(maskUrl, canvasRef.current).catch(() => {});
  }, [maskUrl]);

  const snapshot = () => {
    undoStack.current.push(ctx().getImageData(0, 0, width, height));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    setCanUndo(true);
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (prev) ctx().putImageData(prev, 0, 0);
    setCanUndo(undoStack.current.length > 0);
  };

  const clear = () => {
    snapshot();
    ctx().clearRect(0, 0, width, height);
  };

  // Painted <-> unpainted: "keep the face, change everything else".
  const invert = () => {
    snapshot();
    const c = ctx();
    const data = c.getImageData(0, 0, width, height);
    const px = data.data;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(MASK_COLOR.slice(i, i + 2), 16));
    for (let i = 0; i < px.length; i += 4) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255 - px[i + 3];
    }
    c.putImageData(data, 0, 0);
  };

  // Escape = cancel, Ctrl+Z = undo, [ and ] = brush size
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      } else if (e.key === '[') setSize((s) => Math.max(4, Math.round(s * 0.8)));
      else if (e.key === ']') setSize((s) => Math.min(maxSize, Math.round(s * 1.25)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toCanvas = (e: PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * width, y: ((e.clientY - rect.top) / rect.height) * height };
  };

  const moveCursor = (e: PointerEvent) => {
    const cursor = cursorRef.current;
    const canvas = canvasRef.current;
    if (!cursor || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const d = (size * rect.width) / width;
    cursor.style.width = cursor.style.height = `${d}px`;
    cursor.style.transform = `translate(${e.clientX - rect.left - d / 2}px, ${e.clientY - rect.top - d / 2}px)`;
    cursor.style.display = 'block';
  };

  const paint = (to: Point) => {
    const c = ctx();
    c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    c.strokeStyle = c.fillStyle = MASK_COLOR;
    c.lineWidth = size;
    c.lineCap = c.lineJoin = 'round';
    c.beginPath();
    if (last.current) {
      c.moveTo(last.current.x, last.current.y);
      c.lineTo(to.x, to.y);
      c.stroke();
    } else {
      c.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
      c.fill();
    }
    last.current = to;
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    last.current = null;
    paint(toCanvas(e));
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    moveCursor(e);
    if (last.current) paint(toCanvas(e));
  };

  const endStroke = () => {
    last.current = null;
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      await onSave(isMaskEmpty(canvas) ? null : await strokesToMaskPng(canvas));
    } catch {
      setSaving(false); // the page shows the error; keep the editor open so nothing is lost
    }
  };

  return (
    <div className="mask-editor" role="dialog" aria-label="Paint inpainting mask">
      <header className="mask-toolbar">
        <strong>Paint over what should change</strong>
        <div className="seg">
          <button
            type="button"
            className={`btn small ${tool === 'brush' ? 'active' : ''}`}
            onClick={() => setTool('brush')}
          >
            Brush
          </button>
          <button
            type="button"
            className={`btn small ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
          >
            Eraser
          </button>
        </div>
        <label className="mask-size" title="[ and ] also change the size">
          Size
          <input type="range" min={4} max={maxSize} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <span className="mono">{size}px</span>
        </label>
        <button type="button" className="btn small ghost" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </button>
        <button type="button" className="btn small ghost" onClick={invert} title="Swap painted and unpainted areas">
          Invert
        </button>
        <button type="button" className="btn small ghost" onClick={clear}>
          Clear
        </button>
        <span className="spacer" />
        <button type="button" className="btn small" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn small primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Use this mask'}
        </button>
      </header>

      <div className="mask-stage">
        <div
          className="mask-frame"
          style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc((100vh - 150px) * ${width / height}))` }}
        >
          <img src={imageUrl} alt="Source" draggable={false} />
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => cursorRef.current && (cursorRef.current.style.display = 'none')}
          />
          <div ref={cursorRef} className="mask-cursor" />
        </div>
      </div>

      <footer className="mask-footer muted small">
        Painted = redrawn from your prompt, the rest stays exactly as it is. Paint a little past the edges of the
        object; for a face or hands, cover the whole thing. Ctrl+Z undo · [ ] brush size · Esc cancel
      </footer>
    </div>
  );
}
