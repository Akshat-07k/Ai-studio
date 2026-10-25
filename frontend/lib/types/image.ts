export interface LoraParam {
  name: string;
  strength: number;
  /** null = same as model strength */
  clipStrength: number | null;
  enabled: boolean;
}

/** A file in ComfyUI's input folder (uploaded through /api/image/upload). */
export interface InputFile {
  filename: string;
  subfolder: string;
}

/** The picture img2img / inpainting starts from. Its size becomes the output size. */
export type SourceImage = InputFile & { width: number; height: number };

export type UploadKind = 'source' | 'mask';

export interface GenerateParams {
  checkpoint: string;
  vae: string;
  clipSkip: number;
  loras: LoraParam[];
  positive: string;
  negative: string;
  width: number;
  height: number;
  batchSize: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  /** -1 = random */
  seed: number;
  /** null = text-to-image; set = img2img (or inpainting when `mask` is set too) */
  source: SourceImage | null;
  /** white = redraw, black = keep */
  mask: InputFile | null;
  /** how much of the source gets redrawn: 0 = nothing, 1 = everything */
  denoise: number;
  /** pixels the mask is grown by before feathering */
  maskGrow: number;
  /** blur radius for soft mask edges */
  maskBlur: number;
}

type ImageInputKey = 'source' | 'mask' | 'denoise' | 'maskGrow' | 'maskBlur';

export interface ImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface Job {
  id: string;
  status: JobStatus;
  phase?: string;
  /** Jobs saved before img2img existed have none of the image-input fields. */
  params: Omit<GenerateParams, 'loras' | ImageInputKey> &
    Partial<Pick<GenerateParams, ImageInputKey>> & {
      loras: { name: string; strength: number; clipStrength: number }[];
    };
  progress?: { value: number; max: number } | null;
  images: ImageRef[];
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface EngineOptions {
  checkpoints: string[];
  loras: string[];
  vaes: string[];
  samplers: string[];
  schedulers: string[];
  defaults: Omit<GenerateParams, 'loras'> & { loras: [] };
}

export interface LoraInfo {
  name: string;
  title: string | null;
  author: string | null;
  baseModel: string | null;
  triggerPhrase: string | null;
  trainingTags: string[];
  license: string | null;
}

export type LoraMeta = Record<string, { triggerWords: string }>;
