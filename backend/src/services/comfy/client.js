// Thin client for ComfyUI's HTTP + WebSocket API (the same API its own web UI uses).
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { UpstreamError } from '../../utils/errors.js';

// Binary WebSocket frames: [u32 event][u32 image type][image bytes]
const BINARY_PREVIEW_IMAGE = 1;
const IMAGE_TYPES = { 1: 'image/jpeg', 2: 'image/png' };

export class ComfyClient extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = null;
    this.clientId = randomUUID();
    this.ws = null;
    this.wsConnected = false;
    this.reconnectTimer = null;
  }

  setBaseUrl(url) {
    if (url === this.baseUrl) return;
    this.disconnect();
    this.baseUrl = url;
    if (url) this.connect();
  }

  // ---------- HTTP ----------

  async request(pathname, { method = 'GET', body, timeoutMs = 15_000 } = {}) {
    if (!this.baseUrl) throw new UpstreamError('The image engine (ComfyUI) is not running', 503);
    let res;
    try {
      res = await fetch(this.baseUrl + pathname, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new UpstreamError(`Cannot reach ComfyUI at ${this.baseUrl}: ${err.message}`, 503);
    }
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON response, keep the raw text
    }
    if (!res.ok) {
      throw new UpstreamError(`ComfyUI ${method} ${pathname} failed (${res.status})`, res.status < 500 ? 400 : 502, data);
    }
    return data;
  }

  systemStats() {
    return this.request('/system_stats', { timeoutMs: 3000 });
  }

  objectInfo(nodeClass) {
    return this.request(`/object_info/${encodeURIComponent(nodeClass)}`);
  }

  listModels(folder) {
    return this.request(`/models/${encodeURIComponent(folder)}`);
  }

  modelMetadata(folder, filename) {
    return this.request(`/view_metadata/${encodeURIComponent(folder)}?filename=${encodeURIComponent(filename)}`);
  }

  queuePrompt({ prompt, promptId, extraData = {} }) {
    return this.request('/prompt', {
      method: 'POST',
      body: { prompt, prompt_id: promptId, client_id: this.clientId, extra_data: extraData },
    });
  }

  history(promptId) {
    return this.request(`/history/${encodeURIComponent(promptId)}`);
  }

  queue() {
    return this.request('/queue');
  }

  interrupt(promptId) {
    return this.request('/interrupt', { method: 'POST', body: { prompt_id: promptId } });
  }

  deleteFromQueue(promptIds) {
    return this.request('/queue', { method: 'POST', body: { delete: promptIds } });
  }

  freeMemory() {
    return this.request('/free', { method: 'POST', body: { unload_models: true, free_memory: true } });
  }

  // Saves an image into ComfyUI's input folder (where LoadImage reads from).
  async uploadImage({ data, filename, subfolder = '', overwrite = true }) {
    if (!this.baseUrl) throw new UpstreamError('The image engine (ComfyUI) is not running', 503);
    const form = new FormData();
    form.append('image', new Blob([data], { type: 'image/png' }), filename);
    form.append('subfolder', subfolder);
    form.append('type', 'input');
    form.append('overwrite', String(overwrite));
    let res;
    try {
      res = await fetch(`${this.baseUrl}/upload/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      throw new UpstreamError(`Cannot reach ComfyUI at ${this.baseUrl}: ${err.message}`, 503);
    }
    if (!res.ok) throw new UpstreamError(`ComfyUI upload failed (${res.status})`, 502);
    return res.json(); // { name, subfolder, type }
  }

  // Raw fetch for streaming an output image back to the browser.
  fetchImage({ filename, subfolder = '', type = 'output' }) {
    const qs = new URLSearchParams({ filename, subfolder, type });
    return fetch(`${this.baseUrl}/view?${qs}`);
  }

  // ---------- WebSocket ----------

  connect() {
    if (!this.baseUrl || this.ws) return;
    const ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws?clientId=${this.clientId}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.wsConnected = true;
      this.emit('ws-open');
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        try {
          this.emit('message', JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
        return;
      }
      const buf = Buffer.from(event.data);
      if (buf.length < 8 || buf.readUInt32BE(0) !== BINARY_PREVIEW_IMAGE) return;
      const mime = IMAGE_TYPES[buf.readUInt32BE(4)] ?? 'image/jpeg';
      this.emit('preview', { mime, data: buf.subarray(8) });
    });

    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      const wasConnected = this.wsConnected;
      this.wsConnected = false;
      if (wasConnected) this.emit('ws-close');
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    });
    ws.addEventListener('error', () => {
      // 'close' always follows 'error'; reconnect happens there
    });
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    const ws = this.ws;
    this.ws = null;
    if (this.wsConnected) {
      this.wsConnected = false;
      this.emit('ws-close');
    }
    if (ws) ws.close();
  }
}
