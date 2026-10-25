// Shares one 8 GB GPU between two engines that each want ~7 GB.
//
// In 'auto' mode, before an engine is used, the other one is moved out of VRAM:
//   image generation -> stop llama-server (frees everything it held)
//   chat             -> ask ComfyUI to unload its models (the engine itself stays up)
// In 'manual' mode nothing is unloaded automatically.
import { EventEmitter } from 'node:events';
import { ConflictError } from '../../utils/errors.js';
import { sleep } from '../../utils/process.js';

export class GpuCoordinator extends EventEmitter {
  constructor({ settings, comfyEngine, comfyClient, llmEngine, isImageBusy, isChatBusy }) {
    super();
    this.settings = settings;
    this.comfyEngine = comfyEngine;
    this.comfyClient = comfyClient;
    this.llmEngine = llmEngine;
    this.isImageBusy = isImageBusy;
    this.isChatBusy = isChatBusy;
    // ComfyUI Desktop may already have a model loaded when we attach, so assume it does.
    this.comfyHoldsVram = true;
  }

  get mode() {
    return this.settings.get().gpuMode;
  }

  notice(text) {
    this.emit('notice', { kind: 'info', text });
  }

  async prepareForImage() {
    this.comfyHoldsVram = true;
    if (this.mode !== 'auto') return;
    const llm = this.llmEngine;
    if (!llm.managed || !['ready', 'starting'].includes(llm.state)) return;
    if (this.isChatBusy()) {
      throw new ConflictError('The chat model is still writing a reply. Wait for it or press Stop, then generate again.');
    }
    await llm.stop();
    this.notice('Unloaded the chat model from the GPU to make room for image generation.');
  }

  async prepareForLlm() {
    if (this.mode !== 'auto' || !this.comfyHoldsVram || this.comfyEngine.state !== 'ready') return;
    if (this.isImageBusy()) {
      throw new ConflictError('An image is still generating. Wait for it or cancel it, then try again.');
    }
    await this.comfyClient.freeMemory();
    // ComfyUI applies the unload on its worker loop (checked about once a second).
    await sleep(1500);
    this.comfyHoldsVram = false;
    this.notice('Unloaded the image models from the GPU to make room for the chat model.');
  }
}
