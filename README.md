# Local AI Studio (Interface)

One app for the two local AI tools on this laptop:

- **Image Studio**: SDXL-type models (SDXL, Juggernaut, Animagine, Illustrious, Pony…) with checkpoints and stacked LoRAs, powered by **ComfyUI** running headless.
- **Chat**: talk to a local LLM (Qwen 3.5 9B, or any `.gguf`), powered by **llama.cpp**'s `llama-server`, also headless.

Neither engine's own UI is used. A Next.js frontend talks to a Node.js backend, and the backend drives both engines.

```
 Browser: Next.js (:3000)   Home · Image Studio · Chat
      │  REST + Server-Sent Events (live status, previews, streamed replies)
      ▼
 Backend: Node.js + Express (:4000)
      │  starts/stops engines · builds requests · shares the GPU · saves history
      ├──────────────────────────────┐
      ▼                              ▼
 ComfyUI (Python)                llama-server (llama.cpp)
 :8188 Desktop / :8190 headless  :8080, OpenAI-compatible API
```

## Quick start

```powershell
cd D:\llama-inference\Interface
npm install        # first time only
npm run dev
```

Open **http://localhost:3000**. `Ctrl+C` stops everything, including any engines the app started.

You don't need to configure anything on this machine. The backend finds:
- **ComfyUI Desktop**, using its own config (`%APPDATA%\Comfy Desktop\installations.json`)
- **llama.cpp**: the newest `llama-*\llama-server.exe` next to `Interface`
- **models** in `D:\llama-inference\models`

## Pages

| Page | What it does |
| --- | --- |
| **Home** `/` | What each tool does, live engine status, a VRAM meter, the GPU-sharing mode, recent images and chats, and a "how it works" diagram. |
| **Image Studio** `/image` | Pick a checkpoint, stack LoRAs (trigger words, file metadata), choose an SDXL size preset, set the sampler and seed. Shows a live preview, a queue, and a gallery with "reuse settings". **Start from an image** (upload, drop, paste, or *Edit this image* on a result) to change an existing picture: **img2img** redraws all of it, **inpainting** (paint a mask) redraws only the painted part. *Hold to compare* shows the original. |
| **Chat** `/chat` | Saved conversations, streamed replies, optional *thinking mode* (shows the model's reasoning), Stop / Regenerate, speed stats (tokens/s). The **"Use as image prompt →"** button sends a reply to the Image Studio. Per-chat settings: system prompt, temperature, top P, max length. Model settings: which `.gguf`, context size, GPU layers. |

## Changing an existing image (img2img / inpainting)

1. Under **Start from an image**, upload a picture. You can also drop it, paste it with Ctrl+V, or press **Edit this image** under any result.
   The browser resizes it to about 1 megapixel (what SDXL was trained on), and the output keeps that size.
2. **Describe the result you want, not the change.** SDXL doesn't follow instructions like "make it night".
   Describe the picture as it should look instead: "the same street at night, neon lights, rain".
3. **Denoise** sets how much gets redrawn:
   - about 0.3: touch-ups
   - about 0.5–0.6: clear changes, same layout
   - 0.8 or more: an almost new image
4. To change only one part, click **Paint mask**, paint over it, then press **Use this mask**.
   Only the painted area is regenerated, and the rest stays pixel-for-pixel the same. For inpainting, a denoise of 0.75–1.0 works best.
   *Grow mask* and *Soft edge* widen and feather the mask so the new part blends in.

Any SDXL checkpoint works for both modes. Dedicated SDXL **inpainting** checkpoints (in `models/checkpoints`) blend better at denoise 1.0.
The same graph handles them; just pick one as the checkpoint while a mask is set.

## Sharing one 8 GB GPU

An SDXL checkpoint needs about 7 GB of VRAM. Qwen 9B with a 64K context needs about the same. Only one fits at a time,
so the backend's **GPU coordinator** (`services/gpu/coordinator.js`) swaps them in **Auto-swap** mode (the default):

- **Generate an image** → the chat model is unloaded first (llama-server is stopped).
- **Send a chat message** → ComfyUI is told to unload its models, then llama-server starts (about 6 s when warm).
- If the other side is busy (an image is rendering, or a reply is streaming), you get a clear "wait or stop" message instead of an out-of-memory crash.

Switch to **Manual** on the Home page to handle it yourself with the *Free VRAM* and *Unload* buttons.

**GPU layers: "Auto" is the default for a reason.** It lets llama.cpp's `--fit` place as many layers as actually fit in free VRAM.
Forcing "All" when VRAM is short makes Windows quietly spill into system RAM. Measured on this laptop:
**10.5 tokens/s with "All" vs 19.8 tokens/s with "Auto"**.

## The engines

**ComfyUI** (`ENGINE_MODE=auto`): if ComfyUI Desktop is running on `:8188`, the backend attaches to it. Otherwise it
launches ComfyUI's `main.py` headless on `:8190`, using Desktop's Python, models and output folder.
For a fully UI-free setup, close ComfyUI Desktop before `npm run dev`.

**llama-server** isn't started at boot. It loads the first time you send a message (or click *Load model*). The
command is the same as `Model-Command.txt`, plus `--no-webui`, `-np 1` (one chat gets the whole context) and
`--reasoning-format deepseek` (keeps "thinking" separate from the answer). If a llama-server is already running on `:8080`,
for example one you started by hand, the backend adopts it.

## Where things are saved

| What | Where |
| --- | --- |
| Generated images | ComfyUI's output folder: `…\ComfyUI-Shared\output\Interface\sdxl_00001_.png` (the workflow is embedded in each PNG) |
| Uploaded source images and masks | ComfyUI's input folder: `…\ComfyUI-Shared\input\Interface\source_<hash>.png`, `mask_<hash>.png` (named after their content, so uploading the same image twice stores it once) |
| Image history, chats, settings, LoRA trigger words | `Interface\backend\data\*.json` |

## Project layout

```
Interface/
├─ package.json              npm workspaces; `npm run dev` starts both apps
├─ backend/                  Node.js + Express (plain JavaScript, ES modules)
│  └─ src/
│     ├─ index.js            entry: create services → start server → find engines → clean up on exit
│     ├─ app.js              Express app: middleware → /api routes → error handler
│     ├─ config.js           .env + auto-detection (ComfyUI Desktop, llama.cpp, models)
│     ├─ routes/             thin HTTP layer: validate input, call a service, return JSON
│     │  ├─ index.js         mounts the groups below under /api
│     │  ├─ system.js        /api/health, /api/events (SSE), /api/overview, /api/settings
│     │  ├─ image.js         /api/image/...  engine, models, generate, jobs, view
│     │  ├─ llm.js           /api/llm/...    status, models, start/stop, settings
│     │  └─ chats.js         /api/chats/...  CRUD + streamed replies
│     ├─ services/           the actual logic (no Express in here)
│     │  ├─ index.js         creates every service once and wires events to the browser
│     │  ├─ events.js        one SSE feed fanned out to all open tabs
│     │  ├─ settings.js      user settings (GPU mode, model choice)
│     │  ├─ gpu/             monitor.js (nvidia-smi) · coordinator.js (auto-swap)
│     │  ├─ comfy/           client · engine · workflow (SDXL graph) · jobs · options · uploads
│     │  └─ llm/             engine (llama-server process) · client (streaming) · chats
│     ├─ middleware/         cors.js · errorHandler.js
│     └─ utils/              errors · validate · process (spawn/stop/adopt) · sse · store · logBuffer
└─ frontend/                 Next.js (App Router, TypeScript)
   ├─ app/                   layout.tsx · page.tsx (Home) · image/page.tsx · chat/page.tsx
   ├─ components/
   │  ├─ shell/              AppShell, NavBar, GpuMeter
   │  ├─ providers/          EventsProvider (one SSE connection) · ToastProvider
   │  ├─ home/  image/  chat/   page-specific pieces
   │  └─ ui/                 shared controls, logs drawer, lightbox
   ├─ lib/
   │  ├─ api/                client.ts + one file per backend route group
   │  ├─ types/              system.ts · image.ts · chat.ts
   │  └─ format.ts · sse.ts · storageKeys.ts · imageFile.ts (resizes uploads, builds mask PNGs)
   └─ styles/                base · shell · home · image · chat
```

**Adding a feature** follows the same path every time:
1. Write the logic in a service.
2. Expose it in a route file.
3. Add a function in `lib/api/<group>.ts`.
4. Use it from a component.

Two examples:
- **Upscaling or ControlNet:** add nodes in `services/comfy/workflow.js` (the img2img/inpaint branches show how), then add the matching form fields.
- **A new chat feature:** extend `services/llm/chats.js`, and if it needs an endpoint, `routes/chats.js`.

## Backend API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/events` | SSE feed: `comfy`, `llm`, `gpu`, `settings`, `notice`, `job`, `preview`, `queue` |
| GET | `/api/overview` | everything the Home page shows |
| PUT | `/api/settings` | `{ gpuMode: "auto" \| "manual" }` |
| GET | `/api/image/options` | checkpoints, loras, vaes, samplers, schedulers |
| POST | `/api/image/upload?kind=source\|mask` | body = PNG bytes, already SDXL-sized by the browser → `{ filename, subfolder, width, height }` |
| POST | `/api/image/generate` | start an image (`seed: -1` = random). For img2img add `source` and `denoise`; for inpainting also `mask`, `maskGrow`, `maskBlur` |
| GET | `/api/image/jobs` · POST `/api/image/jobs/:id/cancel` | active jobs + history · cancel |
| GET | `/api/image/view?filename=&subfolder=&type=` | serve an image (`&download=1`) |
| GET/PUT | `/api/image/loras/meta` · GET `/api/image/loras/info?name=` | trigger words · file metadata |
| GET/POST | `/api/image/engine`, `/engine/logs`, `/engine/start`, `/engine/stop`, `/engine/free` | ComfyUI control |
| GET | `/api/llm` · `/api/llm/models` · `/api/llm/logs` | llama-server status, `.gguf` list, console output |
| POST | `/api/llm/start` (optional settings) · `/api/llm/stop` | load / unload the model |
| GET/POST | `/api/chats` | list / create conversations |
| GET/PATCH/DELETE | `/api/chats/:id` | read / rename + settings / delete |
| POST | `/api/chats/:id/messages` · `/api/chats/:id/regenerate` | **SSE stream**: `user`, `status`, `start`, `reasoning`, `content`, `done`, `error` |

## Configuration (optional)

Copy `backend/.env.example` to `backend/.env`. The main options:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GPU_MODE` | `auto` | Initial GPU sharing mode (changeable on the Home page) |
| `ENGINE_MODE` | `auto` | ComfyUI: `auto`, `attach` or `spawn` |
| `COMFY_URL` / `ENGINE_PORT` | `:8188` / `8190` | ComfyUI to attach to / port for the headless one |
| `ENGINE_EXTRA_ARGS` | `--disable-all-custom-nodes` | Extra ComfyUI flags, e.g. `--lowvram` |
| `LLAMA_SERVER` | auto-detected | Path to `llama-server.exe` |
| `LLM_MODELS_DIR` | `D:\llama-inference\models` | Where `.gguf` files are listed from |
| `LLM_CTX` / `LLM_GPU_LAYERS` | `65536` / `auto` | First-run defaults (then the Chat settings win) |
| `LLM_EXTRA_ARGS` | `-fa on --cache-type-k q8_0 --cache-type-v q8_0` | Extra llama-server flags |

## Troubleshooting

- **"Backend offline" in the nav bar**: `npm run dev` isn't running, or port 4000 is taken. The backend now exits with a clear message if the port is in use.
- **Chat model won't load**: open *Logs* on the Chat page. With *Manual* GPU mode, free the image models first.
- **Slow replies (≈10 tok/s instead of ≈20)**: GPU layers are probably set to "All" while VRAM is short. Switch to "Auto".
- **Image engine error / stuck starting**: open *Logs* in the Image Studio. The first headless start takes about 30–40 s.
- **A new model doesn't show up**: use *↻ Refresh models* (images). The chat model list is re-read every time the settings open.
