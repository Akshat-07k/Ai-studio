// App-wide settings the user can change from the UI (persisted in data/settings.json).
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { JsonStore } from '../utils/store.js';

export class SettingsService extends EventEmitter {
  constructor(config) {
    super();
    this.store = new JsonStore(path.join(config.dataDir, 'settings.json'), {});
    const saved = this.store.data;
    this.store.data = {
      gpuMode: saved.gpuMode ?? config.gpuMode,
      llm: { ...config.llm.defaults, ...saved.llm },
    };
  }

  get() {
    return this.store.data;
  }

  update({ gpuMode, llm }) {
    const data = this.store.data;
    if (gpuMode !== undefined) data.gpuMode = gpuMode;
    if (llm) data.llm = { ...data.llm, ...llm };
    this.store.save();
    this.emit('change', data);
    return data;
  }

  flush() {
    this.store.flush();
  }
}
