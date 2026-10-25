// Loads settings from backend/.env (optional) and auto-detects ComfyUI Desktop and
// llama.cpp on this machine so the app works with zero configuration.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendDir, '..', '..'); // D:\llama-inference
const envFile = path.join(backendDir, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isWin = process.platform === 'win32';

const existing = (p) => (p && fs.existsSync(p) ? p : null);
const args = (value) => value.split(/\s+/).filter(Boolean);

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// ComfyUI Desktop keeps a list of installs in %APPDATA%\Comfy Desktop\installations.json.
function detectComfyDesktop() {
  if (!env.APPDATA || !env.LOCALAPPDATA) return null;
  const desktopData = path.join(env.APPDATA, 'Comfy Desktop');
  const installs = readJson(path.join(desktopData, 'installations.json')) ?? [];
  const local = installs.find((i) => i.installPath && i.status === 'installed');
  const comfyDir = local && existing(path.join(local.installPath, 'ComfyUI'));
  if (!comfyDir) return null;

  const shared = path.join(env.LOCALAPPDATA, 'Comfy-Desktop', 'ComfyUI-Shared');
  return {
    comfyDir,
    extraModelPaths: existing(path.join(desktopData, 'instance-model-paths', `${local.id}.yaml`)),
    outputDir: existing(path.join(shared, 'output')),
    inputDir: existing(path.join(shared, 'input')),
  };
}

// Picks the newest llama.cpp release folder next to Interface/ (e.g. llama-b11699-bin-win-cuda-13.4-x64).
function detectLlamaServer() {
  const exe = isWin ? 'llama-server.exe' : 'llama-server';
  let dirs = [];
  try {
    dirs = fs.readdirSync(repoRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('llama'));
  } catch {
    return null;
  }
  const build = (name) => Number(name.match(/-b(\d+)/)?.[1] ?? 0);
  const found = dirs
    .sort((a, b) => build(b.name) - build(a.name))
    .map((d) => path.join(repoRoot, d.name, exe))
    .find((p) => fs.existsSync(p));
  return found ?? null;
}

const desktop = detectComfyDesktop();
const comfyDir = env.COMFY_DIR || desktop?.comfyDir || null;
const comfyPython = comfyDir ? path.join(comfyDir, '.venv', isWin ? 'Scripts/python.exe' : 'bin/python') : null;

const comfyMode = (env.ENGINE_MODE || 'auto').toLowerCase();
if (!['auto', 'attach', 'spawn'].includes(comfyMode)) {
  throw new Error(`ENGINE_MODE must be auto, attach or spawn (got "${comfyMode}")`);
}

export const config = {
  port: Number(env.PORT || 4000),
  host: env.HOST || '127.0.0.1',
  frontendOrigins: (env.FRONTEND_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .concat('http://localhost:3000', 'http://127.0.0.1:3000'),
  dataDir: path.join(backendDir, 'data'),

  // ---------- ComfyUI (image generation) ----------
  comfy: {
    // auto   = use `url` if something is already running there, otherwise launch a headless engine
    // attach = only ever talk to `url`
    // spawn  = always launch our own headless engine on `port`
    mode: comfyMode,
    url: (env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
    dir: comfyDir,
    python: env.COMFY_PYTHON || existing(comfyPython),
    port: Number(env.ENGINE_PORT || 8190),
    extraModelPaths: env.COMFY_EXTRA_MODEL_PATHS || desktop?.extraModelPaths || null,
    outputDir: env.COMFY_OUTPUT_DIR || desktop?.outputDir || null,
    inputDir: env.COMFY_INPUT_DIR || desktop?.inputDir || null,
    extraArgs: args(env.ENGINE_EXTRA_ARGS ?? '--disable-all-custom-nodes'),
    startupTimeoutMs: Number(env.ENGINE_STARTUP_TIMEOUT_MS || 240_000),
    // Subfolder (inside ComfyUI's output dir) that this app saves into.
    outputPrefix: env.OUTPUT_PREFIX || 'Interface/sdxl',
  },

  // ---------- llama.cpp (chat) ----------
  llm: {
    serverPath: env.LLAMA_SERVER || detectLlamaServer(),
    modelsDir: env.LLM_MODELS_DIR || path.join(repoRoot, 'models'),
    port: Number(env.LLM_PORT || 8080),
    // Initial values for the settings the user can change in the Chat page.
    defaults: {
      model: env.LLM_MODEL || '',
      contextSize: Number(env.LLM_CTX || 65536),
      gpuLayers: env.LLM_GPU_LAYERS || 'auto',
    },
    extraArgs: args(env.LLM_EXTRA_ARGS ?? '-fa on --cache-type-k q8_0 --cache-type-v q8_0'),
    startupTimeoutMs: Number(env.LLM_STARTUP_TIMEOUT_MS || 180_000),
  },

  // 'auto' = unload one engine from the GPU before the other one needs it
  gpuMode: env.GPU_MODE || 'auto',
};
