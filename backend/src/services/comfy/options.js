// What the image engine can do right now: installed models plus sampler/scheduler names.
import path from 'node:path';
import { JsonStore } from '../../utils/store.js';
import { DEFAULTS } from './workflow.js';

const TTL_MS = 10_000;

function parseTagFrequency(raw) {
  if (!raw) return [];
  try {
    const counts = new Map();
    for (const dataset of Object.values(JSON.parse(raw))) {
      for (const [tag, n] of Object.entries(dataset)) {
        const t = tag.trim();
        if (t) counts.set(t, (counts.get(t) ?? 0) + Number(n));
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag);
  } catch {
    return [];
  }
}

export class ComfyOptions {
  constructor({ client, dataDir }) {
    this.client = client;
    this.cache = null;
    this.cachedAt = 0;
    this.loraMeta = new JsonStore(path.join(dataDir, 'loras.json'), {});
  }

  invalidate() {
    this.cache = null;
  }

  async get({ fresh = false } = {}) {
    if (!fresh && this.cache && Date.now() - this.cachedAt < TTL_MS) return this.cache;

    const [checkpoints, loras, vaes, ksampler] = await Promise.all([
      this.client.listModels('checkpoints'),
      this.client.listModels('loras'),
      this.client.listModels('vae'),
      this.client.objectInfo('KSampler'),
    ]);
    const required = ksampler.KSampler.input.required;

    this.cache = {
      checkpoints,
      loras,
      vaes,
      samplers: required.sampler_name[0],
      schedulers: required.scheduler[0],
      defaults: DEFAULTS,
    };
    this.cachedAt = Date.now();
    return this.cache;
  }

  // Reads the training metadata baked into a LoRA's .safetensors header.
  async loraInfo(name) {
    let meta = {};
    try {
      meta = (await this.client.modelMetadata('loras', name)) ?? {};
    } catch (err) {
      if (err.status !== 400) throw err; // ComfyUI answers 404 (-> 400 here) when a file has no metadata
    }
    return {
      name,
      title: meta['modelspec.title'] ?? null,
      author: meta['modelspec.author'] ?? meta.author ?? null,
      baseModel: meta.ss_base_model_version ?? meta.ss_sd_model_name ?? meta['modelspec.architecture'] ?? null,
      triggerPhrase: meta['modelspec.trigger_phrase'] ?? null,
      trainingTags: parseTagFrequency(meta.ss_tag_frequency),
      license: meta.license ?? meta['modelspec.license'] ?? null,
    };
  }

  // Trigger words the user saved per LoRA.
  getLoraMeta() {
    return this.loraMeta.data;
  }

  setTriggerWords(name, triggerWords) {
    if (triggerWords.trim()) this.loraMeta.data[name] = { triggerWords: triggerWords.trim() };
    else delete this.loraMeta.data[name];
    this.loraMeta.save();
    return this.loraMeta.data;
  }

  flush() {
    this.loraMeta.flush();
  }
}
