// Tiny JSON-file persistence (gallery history, chats, settings).
import fs from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(file, fallback) {
    this.file = file;
    this.data = fallback;
    this.timer = null;
    this.dirty = false;
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[store] could not read ${file}, starting fresh: ${err.message}`);
    }
  }

  save() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    this.dirty = false;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
