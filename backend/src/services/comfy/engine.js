// Owns the ComfyUI engine: attaches to one that is already running (e.g. ComfyUI
// Desktop), or launches ComfyUI's Python server headless (no browser UI is opened).
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { LogBuffer } from '../../utils/logBuffer.js';
import { isReachable, pidListeningOn, ProcessRunner } from '../../utils/process.js';

const HEALTH_INTERVAL_MS = 5000;

export class ComfyEngine extends EventEmitter {
  constructor(config, client) {
    super();
    this.cfg = config.comfy;
    this.client = client;
    this.state = 'stopped'; // stopped | starting | ready | error
    this.error = null;
    this.url = null;
    this.stats = null;
    this.logs = new LogBuffer();
    this.runner = new ProcessRunner('comfy', this.logs);
    this.healthTimer = null;
    this.startPromise = null;

    this.runner.on('exit', ({ code, expected }) => {
      this.stats = null;
      this.startPromise = null;
      clearInterval(this.healthTimer);
      this.client.setBaseUrl(null);
      if (expected) this.setState('stopped');
      else this.setState('error', `ComfyUI exited unexpectedly (code ${code}). Check the engine logs.`);
    });
  }

  get spawnUrl() {
    return `http://127.0.0.1:${this.cfg.port}`;
  }

  // true when this backend controls the process (spawned or adopted) and may stop it
  get managed() {
    return this.runner.alive;
  }

  get canSpawn() {
    return Boolean(this.cfg.python && this.cfg.dir && fs.existsSync(this.cfg.python));
  }

  async init() {
    const { mode, url } = this.cfg;
    const spawnUp = await isReachable(`${this.spawnUrl}/system_stats`);
    if (mode === 'spawn') return spawnUp ? this.adopt() : this.start();

    if (await isReachable(`${url}/system_stats`)) return this.attach(url);
    if (mode === 'attach') {
      this.setState('error', `Nothing is running at ${url}. Start ComfyUI there, or set ENGINE_MODE=auto.`);
      this.connectTo(url); // keep polling; becomes ready once it comes up
      return;
    }
    // A headless engine left over from a previous backend run is adopted rather than duplicated.
    return spawnUp ? this.adopt() : this.start();
  }

  status() {
    const device = this.stats?.devices?.[0];
    return {
      mode: this.cfg.mode,
      state: this.state,
      url: this.url,
      managed: this.managed,
      canSpawn: this.canSpawn,
      error: this.error,
      comfyVersion: this.stats?.system?.comfyui_version ?? null,
      device: device ? { name: device.name, vramTotal: device.vram_total, vramFree: device.vram_free } : null,
    };
  }

  setState(state, error = null) {
    this.state = state;
    this.error = error;
    this.emit('status', this.status());
  }

  connectTo(url) {
    this.url = url;
    this.client.setBaseUrl(url);
    clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      if (this.state !== 'starting') this.refreshStats();
    }, HEALTH_INTERVAL_MS);
  }

  async attach(url) {
    this.connectTo(url);
    this.logs.push(`[interface] attached to existing ComfyUI at ${url}`);
    await this.refreshStats();
  }

  async adopt() {
    const pid = pidListeningOn(this.cfg.port);
    if (pid) this.runner.adopt(pid);
    this.connectTo(this.spawnUrl);
    await this.refreshStats();
  }

  async refreshStats() {
    try {
      this.stats = await this.client.systemStats();
      if (this.state !== 'ready') this.setState('ready');
      return true;
    } catch (err) {
      if (this.state === 'ready') this.setState('error', `Lost connection to ComfyUI: ${err.message}`);
      return false;
    }
  }

  start() {
    if (this.startPromise) return this.startPromise;
    if (this.runner.alive) return Promise.resolve();
    if (!this.canSpawn) {
      this.setState('error', 'Could not find ComfyUI. Set COMFY_DIR (and optionally COMFY_PYTHON) in backend/.env.');
      return Promise.resolve();
    }

    const { dir, python, port, extraModelPaths, outputDir, inputDir, extraArgs, startupTimeoutMs } = this.cfg;
    const args = [
      path.join(dir, 'main.py'),
      '--listen', '127.0.0.1',
      '--port', String(port),
      '--disable-auto-launch',
      '--preview-method', 'auto',
      // Keep our own instance off the Desktop app's sqlite file.
      '--database-url', 'sqlite:///:memory:',
    ];
    if (extraModelPaths) args.push('--extra-model-paths-config', extraModelPaths);
    if (outputDir) args.push('--output-directory', outputDir);
    if (inputDir) args.push('--input-directory', inputDir);
    args.push(...extraArgs);

    this.stats = null;
    this.url = this.spawnUrl;
    this.setState('starting');
    this.runner.start(python, args, { cwd: dir, env: { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' } });

    this.startPromise = (async () => {
      const ready = await this.runner.waitUntil(() => isReachable(`${this.spawnUrl}/system_stats`), {
        timeoutMs: startupTimeoutMs,
      });
      if (ready) {
        this.connectTo(this.spawnUrl);
        await this.refreshStats();
        this.logs.push('[interface] engine is ready');
      } else if (this.runner.alive) {
        this.setState('error', 'ComfyUI did not become ready in time. Check the engine logs.');
      }
    })().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  stop() {
    return this.runner.stop();
  }

  // Synchronous cleanup for process exit.
  shutdown() {
    clearInterval(this.healthTimer);
    this.client.disconnect();
    this.runner.stop();
  }
}
