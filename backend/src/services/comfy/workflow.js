// Builds a ComfyUI "API format" graph for SDXL. Three modes share one graph:
//
//   CheckpointLoaderSimple -> LoraLoader x N -> [CLIPSetLastLayer] -> CLIPTextEncode (+/-)
//   text-to-image: EmptyLatentImage ------------------------------------------> KSampler
//   img2img:       LoadImage -> VAEEncode --------------------------------------> KSampler (denoise < 1)
//   inpaint:       LoadImage + LoadImageMask -> [GrowMask] -> [blur] -> InpaintModelConditioning
//                  -> KSampler (model through DifferentialDiffusion)
//   KSampler -> VAEDecode ([VAELoader]) -> [inpaint: paste into the original] -> SaveImage
//
// Each key is a node id; inputs that are [nodeId, outputIndex] are wires between nodes.
import { ValidationError } from '../../utils/errors.js';
import { num, str } from '../../utils/validate.js';

export const DEFAULTS = {
  checkpoint: '',
  vae: '',
  clipSkip: 1,
  loras: [],
  positive: '',
  negative: 'lowres, blurry, bad anatomy, bad hands, extra fingers, deformed, watermark, text',
  width: 1024,
  height: 1024,
  batchSize: 1,
  steps: 25,
  cfg: 7,
  sampler: 'dpmpp_2m',
  scheduler: 'karras',
  seed: -1,
  // img2img / inpainting (only used when a source image is set)
  source: null,
  mask: null,
  denoise: 0.6,
  maskGrow: 8,
  maskBlur: 8,
};

const MAX_SEED = 2 ** 48;
const SAFE_FILENAME = /^[\w\-. ()]+\.(png|jpe?g|webp)$/i;
const SAFE_SUBFOLDER = /^[\w\- ]*(\/[\w\- ]+)*$/; // no "..", no absolute paths

// An uploaded file in ComfyUI's input folder: { filename, subfolder }.
function inputImage(ref, label) {
  if (ref === null || ref === undefined) return null;
  if (typeof ref !== 'object') throw new ValidationError(`${label} must be an uploaded image`);
  const filename = str(ref.filename, `${label} file name`, { required: true, max: 200 });
  const subfolder = str(ref.subfolder, `${label} folder`, { max: 200 });
  if (!SAFE_FILENAME.test(filename) || !SAFE_SUBFOLDER.test(subfolder)) {
    throw new ValidationError(`${label} has an invalid file name`);
  }
  return { filename, subfolder };
}

// LoadImage takes "subfolder/name.png", relative to ComfyUI's input folder.
const inputPath = (ref) => (ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename);

// The node whose progress represents "the image is being generated".
export const SAMPLER_NODE_ID = 'sampler';

// Normalises and validates a generate request. Model/sampler names are checked
// against what the engine actually has, so typos fail here with a clear message.
export function normalizeParams(input, options) {
  const p = { ...DEFAULTS, ...input };

  const params = {
    checkpoint: str(p.checkpoint, 'Checkpoint', { required: true }),
    vae: str(p.vae, 'VAE'),
    clipSkip: num(p.clipSkip, 'CLIP skip', { min: 1, max: 12, integer: true }),
    positive: str(p.positive, 'Prompt', { required: true }),
    negative: str(p.negative, 'Negative prompt'),
    width: num(p.width, 'Width', { min: 256, max: 4096, integer: true }),
    height: num(p.height, 'Height', { min: 256, max: 4096, integer: true }),
    batchSize: num(p.batchSize, 'Batch size', { min: 1, max: 8, integer: true }),
    steps: num(p.steps, 'Steps', { min: 1, max: 150, integer: true }),
    cfg: num(p.cfg, 'CFG', { min: 0, max: 30 }),
    sampler: str(p.sampler, 'Sampler', { required: true }),
    scheduler: str(p.scheduler, 'Scheduler', { required: true }),
    seed: num(p.seed, 'Seed', { min: -1, max: MAX_SEED, integer: true }),
    loras: [],
    source: inputImage(p.source, 'Source image'),
    mask: inputImage(p.mask, 'Mask'),
    denoise: num(p.denoise, 'Denoise', { min: 0.01, max: 1 }),
    maskGrow: num(p.maskGrow, 'Mask grow', { min: 0, max: 64, integer: true }),
    maskBlur: num(p.maskBlur, 'Mask feather', { min: 0, max: 31, integer: true }),
  };

  // With a source image the output has the source's size (the browser already fitted it for SDXL).
  if (params.source) {
    params.source.width = num(p.source.width, 'Source image width', { min: 256, max: 4096, integer: true });
    params.source.height = num(p.source.height, 'Source image height', { min: 256, max: 4096, integer: true });
    params.width = params.source.width;
    params.height = params.source.height;
  } else if (params.mask) {
    throw new ValidationError('A mask needs a source image');
  }

  if (params.width % 8 || params.height % 8) throw new ValidationError('Width and height must be multiples of 8');

  if (!Array.isArray(p.loras)) throw new ValidationError('loras must be a list');
  if (p.loras.length > 10) throw new ValidationError('At most 10 LoRAs can be stacked');
  for (const [i, lora] of p.loras.entries()) {
    if (lora?.enabled === false) continue;
    const strength = num(lora?.strength ?? 1, `LoRA #${i + 1} strength`, { min: -5, max: 5 });
    params.loras.push({
      name: str(lora?.name, `LoRA #${i + 1}`, { required: true }),
      strength,
      clipStrength: num(lora?.clipStrength ?? strength, `LoRA #${i + 1} CLIP strength`, { min: -5, max: 5 }),
    });
  }

  if (options) {
    const check = (value, list, label) => {
      if (value && !list.includes(value)) throw new ValidationError(`${label} "${value}" was not found on the engine`);
    };
    check(params.checkpoint, options.checkpoints, 'Checkpoint');
    check(params.vae, options.vaes, 'VAE');
    check(params.sampler, options.samplers, 'Sampler');
    check(params.scheduler, options.schedulers, 'Scheduler');
    for (const lora of params.loras) check(lora.name, options.loras, 'LoRA');
  }

  if (params.seed === -1) params.seed = Math.floor(Math.random() * MAX_SEED);
  return params;
}

export function buildSdxlWorkflow(params, { filenamePrefix }) {
  const graph = {};
  const node = (id, class_type, inputs, title) => {
    graph[id] = { class_type, inputs, _meta: { title } };
    return id;
  };

  const ckpt = node('ckpt', 'CheckpointLoaderSimple', { ckpt_name: params.checkpoint }, 'Load Checkpoint');
  let model = [ckpt, 0];
  let clip = [ckpt, 1];
  let vae = [ckpt, 2];

  params.loras.forEach((lora, i) => {
    const id = node(
      `lora_${i}`,
      'LoraLoader',
      { model, clip, lora_name: lora.name, strength_model: lora.strength, strength_clip: lora.clipStrength },
      `LoRA ${i + 1}`
    );
    model = [id, 0];
    clip = [id, 1];
  });

  if (params.clipSkip > 1) {
    const id = node('clip_skip', 'CLIPSetLastLayer', { clip, stop_at_clip_layer: -params.clipSkip }, 'CLIP Skip');
    clip = [id, 0];
  }

  if (params.vae) {
    const id = node('vae', 'VAELoader', { vae_name: params.vae }, 'Load VAE');
    vae = [id, 0];
  }

  let positive = [node('positive', 'CLIPTextEncode', { text: params.positive, clip }, 'Positive Prompt'), 0];
  let negative = [node('negative', 'CLIPTextEncode', { text: params.negative, clip }, 'Negative Prompt'), 0];
  let latent;
  let pixels = null; // the source image (img2img / inpaint)
  let mask = null; // white = redraw (inpaint only)

  if (!params.source) {
    const id = node(
      'latent',
      'EmptyLatentImage',
      { width: params.width, height: params.height, batch_size: params.batchSize },
      'Empty Latent'
    );
    latent = [id, 0];
  } else {
    pixels = [node('source', 'LoadImage', { image: inputPath(params.source) }, 'Source Image'), 0];

    if (params.mask) {
      mask = [node('mask', 'LoadImageMask', { image: inputPath(params.mask), channel: 'red' }, 'Inpaint Mask'), 0];
      if (params.maskGrow > 0) {
        const id = node('mask_grow', 'GrowMask', { mask, expand: params.maskGrow, tapered_corners: true }, 'Grow Mask');
        mask = [id, 0];
      }
      // Soft edges blend the new pixels into the old ones instead of leaving a visible seam.
      if (params.maskBlur > 0) {
        const asImage = node('mask_image', 'MaskToImage', { mask }, 'Mask to Image');
        const blurred = node(
          'mask_blur',
          'ImageBlur',
          { image: [asImage, 0], blur_radius: params.maskBlur, sigma: Math.min(10, Math.max(0.1, params.maskBlur / 2)) },
          'Feather Mask'
        );
        mask = [node('mask_soft', 'ImageToMask', { image: [blurred, 0], channel: 'red' }, 'Image to Mask'), 0];
      }
      // Works with normal checkpoints (noise mask) and with dedicated inpainting checkpoints (which also
      // read the masked image from the conditioning).
      const inpaint = node(
        'inpaint',
        'InpaintModelConditioning',
        { positive, negative, vae, pixels, mask, noise_mask: true },
        'Inpaint Conditioning'
      );
      positive = [inpaint, 0];
      negative = [inpaint, 1];
      latent = [inpaint, 2];
      // Treats the soft mask edge as "change a little" instead of a hard on/off.
      model = [node('diff_diffusion', 'DifferentialDiffusion', { model, strength: 1 }, 'Differential Diffusion'), 0];
    } else {
      latent = [node('encode', 'VAEEncode', { pixels, vae }, 'VAE Encode'), 0];
    }

    if (params.batchSize > 1) {
      const id = node('latent_batch', 'RepeatLatentBatch', { samples: latent, amount: params.batchSize }, 'Repeat Latent');
      latent = [id, 0];
    }
  }

  const sampler = node(
    SAMPLER_NODE_ID,
    'KSampler',
    {
      model,
      positive,
      negative,
      latent_image: latent,
      seed: params.seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      denoise: params.source ? params.denoise : 1,
    },
    'KSampler'
  );
  let images = [node('decode', 'VAEDecode', { samples: [sampler, 0], vae }, 'VAE Decode'), 0];

  // Outside the mask, keep the original pixels exactly (a VAE round trip slightly softens them).
  if (mask) {
    let original = pixels;
    if (params.batchSize > 1) {
      original = [node('source_batch', 'RepeatImageBatch', { image: pixels, amount: params.batchSize }, 'Repeat Source'), 0];
    }
    const id = node(
      'composite',
      'ImageCompositeMasked',
      { destination: original, source: images, x: 0, y: 0, resize_source: false, mask },
      'Paste Into Original'
    );
    images = [id, 0];
  }

  node('save', 'SaveImage', { images, filename_prefix: filenamePrefix }, 'Save Image');

  return graph;
}
