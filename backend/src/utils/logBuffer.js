// Keeps the last N lines of a process's console output (shown in the Logs drawer).
const ANSI = /\x1b\[[0-9;]*m/g;

export class LogBuffer {
  constructor(max = 500) {
    this.max = max;
    this.lines = [];
  }

  push(line) {
    this.lines.push(line.replace(ANSI, ''));
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }
}
