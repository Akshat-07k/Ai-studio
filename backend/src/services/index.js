// Creates every service once and wires them together. Routes receive this object,
// so adding a feature means: write a service here, then expose it in a route file.
import { EventHub } from './events.js';
import { SettingsService } from './settings.js';
import { GpuMonitor } from './gpu/monitor.js';
import { GpuCoordinator } from './gpu/coordinator.js';
import { ComfyClient } from './comfy/client.js';
import { ComfyEngine } from './comfy/engine.js';
import { ComfyOptions } from './comfy/options.js';
import { ImageJobs } from './comfy/jobs.js';
import { ImageUploads } from './comfy/uploads.js';
import { LlamaEngine } from './llm/engine.js';
import { LlamaClient } from './llm/client.js';
import { ChatService } from './llm/chats.js';

export function createServices(config) {
  const events = new EventHub();
  const settings = new SettingsService(config);
  const gpuMonitor = new GpuMonitor();

  // Image generation (ComfyUI)
  const comfyClient = new ComfyClient();
  const comfyEngine = new ComfyEngine(config, comfyClient);
  const comfyOptions = new ComfyOptions({ client: comfyClient, dataDir: config.dataDir });
  const comfyUploads = new ImageUploads({ client: comfyClient });

  // Chat (llama.cpp)
  const llmEngine = new LlamaEngine(config, settings);
  const llmClient = new LlamaClient(llmEngine);

  // The coordinator needs to know whether either side is busy; those services are
  // created right after it, so it gets small lookups instead of the objects.
  let imageJobs;
  let chats;
  const gpu = new GpuCoordinator({
    settings,
    comfyEngine,
    comfyClient,
    llmEngine,
    isImageBusy: () => imageJobs.activeCount > 0,
    isChatBusy: () => chats.activeCount > 0,
  });
  imageJobs = new ImageJobs({
    client: comfyClient,
    options: comfyOptions,
    gpu,
    dataDir: config.dataDir,
    outputPrefix: config.comfy.outputPrefix,
  });
  chats = new ChatService({ client: llmClient, engine: llmEngine, gpu, dataDir: config.dataDir });

  // ---------- push changes to the browser ----------
  comfyEngine.on('status', (status) => {
    comfyOptions.invalidate();
    events.broadcast('comfy', status);
  });
  llmEngine.on('status', (status) => events.broadcast('llm', status));
  settings.on('change', (data) => events.broadcast('settings', data));
  gpu.on('notice', (notice) => events.broadcast('notice', notice));
  gpuMonitor.on('update', (stats) => events.broadcast('gpu', stats));
  imageJobs.on('job', (job) => events.broadcast('job', job));
  imageJobs.on('job-removed', (id) => events.broadcast('job-removed', { id }));
  imageJobs.on('preview', (preview) => events.broadcast('preview', preview));
  imageJobs.on('queue', (remaining) => events.broadcast('queue', { remaining }));
  // Only run nvidia-smi while a browser is actually watching.
  events.on('clients', (count) => gpuMonitor.setActive(count > 0));

  return {
    config,
    events,
    settings,
    gpu,
    gpuMonitor,
    comfy: { client: comfyClient, engine: comfyEngine, options: comfyOptions, jobs: imageJobs, uploads: comfyUploads },
    llm: { client: llmClient, engine: llmEngine, chats },

    async init() {
      await Promise.all([comfyEngine.init(), llmEngine.init()]);
    },

    // Synchronous: also runs from process.on('exit').
    shutdown() {
      imageJobs.flush();
      comfyOptions.flush();
      chats.flush();
      settings.flush();
      gpuMonitor.setActive(false);
      comfyEngine.shutdown();
      llmEngine.shutdown();
    },
  };
}
