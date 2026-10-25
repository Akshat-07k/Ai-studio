// Polls nvidia-smi for live VRAM / utilisation numbers while someone is watching.
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';

const QUERY = 'name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu';

function querySmi() {
  return new Promise((resolve, reject) => {
    execFile(
      'nvidia-smi',
      [`--query-gpu=${QUERY}`, '--format=csv,noheader,nounits'],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

export class GpuMonitor extends EventEmitter {
  constructor({ intervalMs = 3000 } = {}) {
    super();
    this.intervalMs = intervalMs;
    this.latest = null;
    this.timer = null;
    this.available = true;
  }

  setActive(active) {
    if (active && !this.timer) {
      this.poll();
      this.timer = setInterval(() => this.poll(), this.intervalMs);
    } else if (!active && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll() {
    try {
      const [name, total, used, free, util, temp] = (await querySmi()).trim().split('\n')[0].split(',').map((s) => s.trim());
      this.available = true;
      this.latest = {
        name,
        totalMb: Number(total),
        usedMb: Number(used),
        freeMb: Number(free),
        utilization: Number(util),
        temperature: Number(temp),
      };
    } catch {
      this.available = false;
      this.latest = null;
    }
    this.emit('update', this.latest);
    return this.latest;
  }
}
