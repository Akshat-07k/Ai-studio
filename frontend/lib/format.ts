// SDXL was trained on ~1 megapixel "buckets"; these sizes give the cleanest results.
export const SDXL_SIZES = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '4:5', width: 896, height: 1152 },
  { label: '2:3', width: 832, height: 1216 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '9:21', width: 640, height: 1536 },
  { label: '5:4', width: 1152, height: 896 },
  { label: '3:2', width: 1216, height: 832 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '21:9', width: 1536, height: 640 },
];

/** "juggernautXL_ragnarok.safetensors" -> "juggernautXL_ragnarok" */
export function displayName(file: string) {
  return file.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '').split(/[\\/]/).pop() ?? file;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '-';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatMb(mb: number | null | undefined) {
  if (mb == null) return '-';
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatContext(tokens: number | null | undefined) {
  if (!tokens) return '-';
  return tokens >= 1024 ? `${Math.round(tokens / 1024)}K` : String(tokens);
}

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** "cuda:0 NVIDIA GeForce RTX 5050 Laptop GPU : cudaMallocAsync" -> "NVIDIA GeForce RTX 5050 Laptop GPU" */
export function gpuName(name: string) {
  return name.replace(/^cuda:\d+\s*/, '').replace(/\s*:\s*\w+$/, '');
}
