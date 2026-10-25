// Tracks image generations from "queued" to "done", translating ComfyUI's WebSocket
// events into job snapshots the frontend can render directly.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { UpstreamError } from '../../utils/errors.js';
import { JsonStore } from '../../utils/store.js';
import { buildSdxlWorkflow, normalizeParams, SAMPLER_NODE_ID } from './workflow.js';

const MAX_HISTORY = 1000;
const PREVIEW_MIN_INTERVAL_MS = 250;
const RECONCILE_INTERVAL_MS = 10_000;

const PHASES = {
  ckpt: 'Loading checkpoint',
  vae: 'Loading VAE',
  clip_skip: 'Loading models',
  positive: 'Encoding prompt',
  negative: 'Encoding prompt',
  latent: 'Preparing latent',
  latent_batch: 'Preparing latent',
  source: 'Loading source image',
  encode: 'Encoding source image',
  inpaint: 'Encoding source image',
  diff_diffusion: 'Loading models',
  [SAMPLER_NODE_ID]: 'Sampling',
  decode: 'Decoding image',
  source_batch: 'Blending into original',
  composite: 'Blending into original',
  save: 'Saving',
};

function phaseFor(nodeId) {
  if (nodeId?.startsWith('lora_')) return 'Loading LoRAs';
  if (nodeId?.startsWith('mask')) return 'Preparing mask';
  return PHASES[nodeId] ?? 'Working';
}

// Turns ComfyUI's validation response into one readable sentence.
function describeComfyError(err) {
  const body = err.body;
  if (!body || typeof body !== 'object') return err.message;
  const parts = [];
  if (body.error?.message) parts.push(body.error.message);
  for (const nodeErr of Object.values(body.node_errors ?? {})) {
    for (const e of nodeErr.errors ?? []) {
      parts.push(`${nodeErr.class_type}: ${e.message}${e.details ? ` (${e.details})` : ''}`);
    }
  }
  return parts.join(' - ') || err.message;
}

function outputImages(outputs) {
  const images = [];
  for (const out of Object.values(outputs ?? {})) {
    for (const img of out.images ?? []) {
      if (img.type === 'output') images.push({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    }
  }
  return images;
}

export class ImageJobs extends EventEmitter {
  constructor({ client, options, gpu, dataDir, outputPrefix }) {
    super();
    this.client = client;
    this.options = options;
    this.gpu = gpu;
    this.outputPrefix = outputPrefix;
    this.history = new JsonStore(path.join(dataDir, 'history.json'), []); // finished jobs, newest first
    this.jobs = new Map(); // active jobs only
    this.runningId = null;
    this.lastPreviewAt = 0;
    this.queueRemaining = 0;

    client.on('message', (msg) => this.onMessage(msg));
    client.on('preview', (preview) => this.onPreview(preview));
    client.on('ws-open', () => this.reconcile());
    setInterval(() => this.reconcile(), RECONCILE_INTERVAL_MS).unref();
  }

  get activeCount() {
    return this.jobs.size;
  }

  list() {
    return { active: [...this.jobs.values()], history: this.history.data, queueRemaining: this.queueRemaining };
  }

  async create(input) {
    const params = normalizeParams(input, await this.options.get());
    await this.gpu.prepareForImage();

    const id = randomUUID();
    const job = {
      id,
      status: 'queued',
      phase: 'Queued',
      params,
      progress: null,
      images: [],
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.set(id, job);
    this.emit('job', job);

    try {
      // We pick the prompt_id ourselves so WebSocket events can never beat the HTTP response.
      await this.client.queuePrompt({
        prompt: buildSdxlWorkflow(params, { filenamePrefix: this.outputPrefix }),
        promptId: id,
        extraData: { preview_method: 'auto' },
      });
    } catch (err) {
      this.jobs.delete(id);
      this.emit('job-removed', id);
      if (err instanceof UpstreamError) err.message = describeComfyError(err);
      throw err;
    }
    return job;
  }

  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.status === 'running') {
      job.phase = 'Cancelling';
      this.emit('job', job);
      await this.client.interrupt(id);
    } else {
      await this.client.deleteFromQueue([id]);
      this.finish(job, 'cancelled');
    }
    return job;
  }

  removeFromHistory(id) {
    const before = this.history.data.length;
    this.history.data = this.history.data.filter((j) => j.id !== id);
    if (this.history.data.length === before) return false;
    this.history.save();
    return true;
  }

  finish(job, status, { error = null, images } = {}) {
    if (!this.jobs.has(job.id)) return;
    job.status = status;
    job.error = error;
    job.phase = status === 'done' ? 'Done' : status === 'cancelled' ? 'Cancelled' : 'Failed';
    job.finishedAt = Date.now();
    if (images?.length) job.images = images;
    this.jobs.delete(job.id);
    if (this.runningId === job.id) this.runningId = null;

    if (status === 'done' && job.images.length) {
      const { progress, phase, ...record } = job;
      this.history.data.unshift(record);
      this.history.data.length = Math.min(this.history.data.length, MAX_HISTORY);
      this.history.save();
    }
    this.emit('job', job);
  }

  async finishFromHistory(job) {
    try {
      const entry = (await this.client.history(job.id))?.[job.id];
      if (entry) return this.applyHistoryEntry(job, entry);
    } catch {
      // fall through with whatever the WebSocket already gave us
    }
    this.finish(job, job.images.length ? 'done' : 'error', {
      error: job.images.length ? null : 'Finished without producing an image',
    });
  }

  applyHistoryEntry(job, entry) {
    const messages = entry.status?.messages ?? [];
    const find = (type) => messages.find(([t]) => t === type)?.[1];
    if (find('execution_interrupted')) return this.finish(job, 'cancelled');
    if (entry.status?.status_str === 'error') {
      const e = find('execution_error');
      return this.finish(job, 'error', { error: e ? `${e.node_type}: ${e.exception_message}` : 'Generation failed' });
    }
    const images = outputImages(entry.outputs);
    this.finish(job, images.length ? 'done' : 'error', {
      images,
      error: images.length ? null : 'Finished without producing an image',
    });
  }

  onMessage({ type, data }) {
    if (type === 'status') {
      this.queueRemaining = data?.status?.exec_info?.queue_remaining ?? 0;
      this.emit('queue', this.queueRemaining);
      return;
    }

    const job = data?.prompt_id ? this.jobs.get(data.prompt_id) : null;
    if (!job) return;

    switch (type) {
      case 'execution_start':
        job.status = 'running';
        job.phase = 'Starting';
        job.startedAt = Date.now();
        this.runningId = job.id;
        break;
      case 'executing':
        // node === null is sent after ComfyUI has written the history entry.
        if (data.node == null) {
          this.finishFromHistory(job);
          return;
        }
        this.runningId = job.id;
        job.status = 'running';
        job.phase = phaseFor(data.node);
        if (data.node !== SAMPLER_NODE_ID) job.progress = null;
        break;
      case 'progress':
        if (data.node !== SAMPLER_NODE_ID) return;
        job.progress = { value: data.value, max: data.max };
        break;
      case 'executed':
        job.images.push(...outputImages({ [data.node]: data.output }));
        break;
      case 'execution_success':
        job.phase = 'Finishing';
        job.progress = null;
        break;
      case 'execution_interrupted':
        this.finish(job, 'cancelled');
        return;
      case 'execution_error':
        this.finish(job, 'error', { error: `${data.node_type}: ${data.exception_message}` });
        return;
      default:
        return;
    }
    this.emit('job', job);
  }

  onPreview({ mime, data }) {
    if (!this.runningId) return;
    const now = Date.now();
    if (now - this.lastPreviewAt < PREVIEW_MIN_INTERVAL_MS) return;
    this.lastPreviewAt = now;
    this.emit('preview', { jobId: this.runningId, dataUrl: `data:${mime};base64,${data.toString('base64')}` });
  }

  // Catches up on anything missed while the WebSocket was down (or the engine restarted).
  async reconcile() {
    const active = [...this.jobs.values()];
    if (!active.length) return;
    let queue;
    try {
      queue = await this.client.queue();
    } catch {
      return;
    }
    const inQueue = new Set([...queue.queue_running, ...queue.queue_pending].map((item) => item[1]));
    for (const job of active) {
      if (inQueue.has(job.id) || Date.now() - job.createdAt < 5000) continue;
      try {
        const entry = (await this.client.history(job.id))?.[job.id];
        if (entry) this.applyHistoryEntry(job, entry);
        else this.finish(job, 'error', { error: 'Job was lost (the engine restarted or its queue was cleared)' });
      } catch {
        // engine unreachable; try again next round
      }
    }
  }

  flush() {
    this.history.flush();
  }
}
