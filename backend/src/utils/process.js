// Helpers for running engine processes (ComfyUI's Python server, llama-server.exe).
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function isReachable(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

// Kills a process and everything it started (e.g. the venv python.exe launcher and the real python).
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

// Finds the process listening on a local TCP port, so an engine left running
// (by a previous backend or by hand) can be adopted and later stopped.
export function pidListeningOn(port) {
  if (process.platform !== 'win32') {
    const out = spawnSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout;
    return Number(out?.split('\n')[0]) || null;
  }
  const out = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }).stdout ?? '';
  for (const line of out.split(/\r?\n/)) {
    const [proto, local, , state, pid] = line.trim().split(/\s+/);
    if (proto === 'TCP' && local?.endsWith(`:${port}`) && state === 'LISTENING') return Number(pid) || null;
  }
  return null;
}

/**
 * Runs one long-lived child process, mirrors its output into a LogBuffer and the
 * console, and emits `exit` with `{ code, expected }` when it ends.
 * It can also "adopt" a process it didn't start (by pid), so stop() still works.
 */
export class ProcessRunner extends EventEmitter {
  constructor(name, logs) {
    super();
    this.name = name;
    this.logs = logs;
    this.child = null;
    this.adoptedPid = null;
    this.stopping = false;
  }

  get alive() {
    return Boolean(this.child || this.adoptedPid);
  }

  get pid() {
    return this.child?.pid ?? this.adoptedPid;
  }

  start(command, args, { cwd, env } = {}) {
    if (this.alive) throw new Error(`${this.name} is already running`);
    this.logs.push(`[interface] launching: ${command} ${args.join(' ')}`);
    this.stopping = false;

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    let pending = '';
    const onData = (chunk) => {
      pending += chunk.toString('utf8');
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        this.logs.push(line);
        console.log(`[${this.name}] ${line}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const finish = (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const expected = this.stopping;
      this.stopping = false;
      this.logs.push(`[interface] ${this.name} exited (code ${code ?? '-'}${signal ? `, ${signal}` : ''})`);
      this.emit('exit', { code, signal, expected });
    };
    child.on('exit', finish);
    child.on('error', (err) => {
      this.logs.push(`[interface] failed to launch ${this.name}: ${err.message}`);
      finish(null, null);
    });
    return child;
  }

  adopt(pid) {
    this.adoptedPid = pid;
    this.logs.push(`[interface] adopted running ${this.name} (pid ${pid})`);
  }

  // Resolves once the process is gone.
  stop() {
    if (this.child) {
      const exited = new Promise((resolve) => this.once('exit', resolve));
      this.stopping = true;
      killTree(this.child.pid);
      return Promise.race([exited, sleep(10_000)]);
    }
    if (this.adoptedPid) {
      killTree(this.adoptedPid); // synchronous on Windows
      this.adoptedPid = null;
      this.logs.push(`[interface] stopped adopted ${this.name}`);
      this.emit('exit', { code: null, signal: null, expected: true });
    }
    return Promise.resolve();
  }

  // Forgets an adopted process that disappeared on its own.
  forget() {
    if (!this.adoptedPid) return;
    this.adoptedPid = null;
    this.emit('exit', { code: null, signal: null, expected: false });
  }

  // Polls `check` until it returns true; gives up if the process dies or time runs out.
  async waitUntil(check, { timeoutMs, intervalMs = 1000 }) {
    const deadline = Date.now() + timeoutMs;
    while (this.alive && Date.now() < deadline) {
      if (await check()) return true;
      await sleep(intervalMs);
    }
    return false;
  }
}
