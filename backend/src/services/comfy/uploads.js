// Source images and masks for img2img / inpainting. The browser already resized them
// to an SDXL-friendly size and converted them to PNG; here we check that, name the file
// after its content (re-uploading the same image is free) and hand it to ComfyUI.
import { createHash } from 'node:crypto';
import { ValidationError } from '../../utils/errors.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SUBFOLDER = 'Interface';
export const UPLOAD_KINDS = ['source', 'mask'];

// Width and height live in the IHDR chunk, right after the 8-byte signature.
function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ValidationError('Upload must be a PNG image');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export class ImageUploads {
  constructor({ client }) {
    this.client = client;
  }

  async save(data, kind) {
    const { width, height } = pngSize(data);
    if (width < 256 || height < 256 || width > 4096 || height > 4096) {
      throw new ValidationError(`Image must be between 256 and 4096 pixels per side (got ${width}×${height})`);
    }
    if (width % 8 || height % 8) throw new ValidationError('Image width and height must be multiples of 8');

    const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
    const saved = await this.client.uploadImage({ data, filename: `${kind}_${hash}.png`, subfolder: SUBFOLDER });
    return { filename: saved.name, subfolder: saved.subfolder ?? SUBFOLDER, type: 'input', width, height };
  }
}
