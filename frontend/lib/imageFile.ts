// Browser-side image prep for img2img / inpainting. Everything is resized here, before
// upload, so the backend and ComfyUI always get a PNG of the exact size that will be generated.

/** SDXL was trained on ~1 megapixel images. Much smaller looks mushy, much larger repeats things. */
const TARGET_PIXELS = 1024 * 1024;

/** Stroke colour used while painting; only the alpha channel matters for the exported mask. */
export const MASK_COLOR = '#8b7cff';

/** Size to generate at for a picture of `width`×`height`: ~1 MP, same shape, multiples of 8. */
export function fitForSdxl(width: number, height: number) {
  const pixels = width * height;
  // Already about SDXL-sized (e.g. one of our own generations): keep the size as it is.
  const scale =
    pixels >= TARGET_PIXELS * 0.75 && pixels <= TARGET_PIXELS * 1.35 ? 1 : Math.sqrt(TARGET_PIXELS / pixels);
  const snap = (v: number) => Math.min(4096, Math.max(256, Math.round((v * scale) / 8) * 8));
  return { width: snap(width), height: snap(height) };
}

/** Decodes a File or an image URL (EXIF rotation applied). */
async function loadBitmap(src: Blob | string) {
  // no-store: an <img> may have cached this URL without CORS headers, which would make fetch() fail.
  const blob =
    typeof src === 'string'
      ? await fetch(src, { cache: 'no-store' }).then((r) => {
          if (!r.ok) throw new Error(`Could not load the image (${r.status})`);
          return r.blob();
        })
      : src;
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Your browser cannot read this file. Use a PNG, JPG or WebP image.');
  }
}

export function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png'),
  );
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Any picture -> SDXL-sized PNG, ready for `api.image.upload(png, 'source')`. */
export async function toSourcePng(src: Blob | string) {
  const bitmap = await loadBitmap(src);
  const { width, height } = fitForSdxl(bitmap.width, bitmap.height);
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff'; // transparent areas become white instead of black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvasToPng(canvas);
}

/** True when nothing has been painted on the stroke canvas. */
export function isMaskEmpty(strokes: HTMLCanvasElement) {
  const px = strokes.getContext('2d')!.getImageData(0, 0, strokes.width, strokes.height).data;
  for (let i = 3; i < px.length; i += 4) if (px[i]) return false;
  return true;
}

/** Painted strokes (alpha) -> black/white mask PNG (white = redraw). */
export function strokesToMaskPng(strokes: HTMLCanvasElement) {
  const { width, height } = strokes;
  const data = strokes.getContext('2d')!.getImageData(0, 0, width, height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i + 1] = px[i + 2] = px[i + 3];
    px[i + 3] = 255;
  }
  const out = newCanvas(width, height);
  out.getContext('2d')!.putImageData(data, 0, 0);
  return canvasToPng(out);
}

/** Saved mask PNG -> strokes on `strokes` (so an existing mask can be edited further). */
export async function drawMaskAsStrokes(maskUrl: string, strokes: HTMLCanvasElement) {
  const bitmap = await loadBitmap(maskUrl);
  const { width, height } = strokes;
  const tmp = newCanvas(width, height);
  const tctx = tmp.getContext('2d')!;
  tctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = tctx.getImageData(0, 0, width, height);
  const px = data.data;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(MASK_COLOR.slice(i, i + 2), 16));
  for (let i = 0; i < px.length; i += 4) {
    px[i + 3] = px[i]; // white -> painted
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  strokes.getContext('2d')!.putImageData(data, 0, 0);
}
