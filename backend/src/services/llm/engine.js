// Runs llama-server.exe (llama.cpp) headless with the model and settings chosen in
// the Chat page. Equivalent to the command in Model-Command.txt, minus the web UI.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../utils/errors.js';
import { LogBuffer } from '../../utils/logBuffer.js';
import { isReachable, pidListeningOn, ProcessRunner } from '../../utils/process.js';

const HEALTH_INTERVAL_MS = 5000;

export class LlamaEngine extends EventEmitter {
  constructor(config, settings) {
    super();
    this.cfg = config.llm;
    this.settings = settings;
    this.state = 'stopped'; // stopped | starting | ready | error
    this.error = null;
    this.loaded = null; // { model, contextSize, gpuLayers } of the running server
    this.logs = new LogBuffer();
    this.runner = new ProcessRunner('llama', this.logs);
    this.startPromise = null;
    this.healthTimer = null;

    this.runner.on('exit', ({ code, expected }) => {
      this.loaded = null;
      clearInterval(this.healthTimer);
      if (expected) this.setState('stopped');
      else this.setState('error', `llama-server exited unexpectedly (code ${code ?? '-'}). Check the logs.`);
    });
  }

  get url() {
    return `http://127.0.0.1:${this.cfg.port}`;
  }

  get managed() {
    return this.runner.alive;
  }

  listModels() {
    try {
      return fs
        .readdirSync(this.cfg.modelsDir)
        .filter((f) => f.toLowerCase().endsWith('.gguf') && !/mmproj/i.test(f))
        .map((file) => ({ file, sizeBytes: fs.statSync(path.join(this.cfg.modelsDir, file)).size }));
    } catch {
      return [];
    }
  }

  // The model that will load next: the saved choice, or the first .gguf if none/missing.
  selectedModel() {
    const models = this.listModels();
    const saved = this.settings.get().llm.model;
    return models.some((m) => m.file === saved) ? saved : (models[0]?.file ?? null);
  }

  status() {
    return {
      selectedModel: this.selectedModel(),
      state: this.state,
      error: this.error,
      url: this.url,
      managed: this.managed,
      available: Boolean(this.cfg.serverPath),
      serverPath: this.cfg.serverPath,
      modelsDir: this.cfg.modelsDir,
      loaded: this.loaded,
      settings: this.settings.get().llm,
    };
  }

  setState(state, error = null) {
    this.state = state;
    this.error = error;
    this.emit('status', this.status());
  }

  // Adopts a llama-server already listening on our port (e.g. one started by hand).
  async init() {
    if (!(await isReachable(`${this.url}/health`))) return;
    const pid = pidListeningOn(this.cfg.port);
    if (pid) this.runner.adopt(pid);
    try {
      const props = await (await fetch(`${this.url}/props`)).json();
      this.loaded = {
        model: path.basename(props.model_path ?? 'unknown'),
        contextSize: props.default_generation_settings?.n_ctx ?? null,
        gpuLayers: 'unknown',
      };
    } catch {
      this.loaded = { model: 'unknown', contextSize: null, gpuLayers: 'unknown' };
    }
    this.setState('ready');
    this.startHealthChecks();
  }

  startHealthChecks() {
    clearInterval(this.healthTimer);
    this.healthTimer = setInterval(async () => {
      if (this.state !== 'ready' || (await isReachable(`${this.url}/health`))) return;
      if (this.runner.child) return; // the process 'exit' handler will report it
      this.runner.forget();
    }, HEALTH_INTERVAL_MS);
  }

  buildArgs({ model, contextSize, gpuLayers }) {
    const args = [
      '-m', path.join(this.cfg.modelsDir, model),
      '-c', String(contextSize),
      '--host', '127.0.0.1',
      '--port', String(this.cfg.port),
      '--no-webui',
      // One chat at a time gets the whole context window.
      '-np', '1',
      // Put Qwen's "thinking" in its own field instead of mixing it into the answer.
      '--reasoning-format', 'deepseek',
    ];
    // 'auto' leaves -ngl unset so llama.cpp's --fit picks as many layers as fit in free VRAM.
    if (gpuLayers === 'all') args.push('-ngl', '99', '-fit', 'off');
    else if (gpuLayers !== 'auto') args.push('-ngl', String(gpuLayers), '-fit', 'off');
    return [...args, ...this.cfg.extraArgs];
  }

  ensureRunning() {
    if (this.state === 'ready') return Promise.resolve();
    return this.startPromise ?? this.start();
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (!this.cfg.serverPath) {
      throw new HttpError(503, 'llama-server.exe was not found. Set LLAMA_SERVER in backend/.env.');
    }
    const model = this.selectedModel();
    if (!model) throw new HttpError(503, `No .gguf models found in ${this.cfg.modelsDir}`);
    const settings = { ...this.settings.get().llm, model };

    if (this.runner.alive) await this.stop();

    this.loaded = settings;
    this.setState('starting');
    this.runner.start(this.cfg.serverPath, this.buildArgs(settings), { cwd: path.dirname(this.cfg.serverPath) });

    this.startPromise = (async () => {
      const ready = await this.runner.waitUntil(() => isReachable(`${this.url}/health`), {
        timeoutMs: this.cfg.startupTimeoutMs,
        intervalMs: 500,
      });
      if (ready) {
        this.logs.push('[interface] model loaded, server ready');
        this.setState('ready');
        this.startHealthChecks();
        return;
      }
      if (this.runner.alive) {
        await this.runner.stop();
        this.setState('error', 'llama-server did not become ready in time. Check the logs.');
      }
      throw new HttpError(503, this.error ?? 'llama-server failed to start. Check the logs.');
    })().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  stop() {
    return this.runner.stop();
  }

  shutdown() {
    clearInterval(this.healthTimer);
    this.runner.stop();
  }
}
