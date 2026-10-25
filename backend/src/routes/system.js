// App-wide endpoints: health, the live event feed, the Home page overview, settings.
import { Router } from 'express';
import { oneOf } from '../utils/validate.js';

export function systemRoutes({ events, settings, gpuMonitor, comfy, llm }) {
  const router = Router();

  router.get('/health', (req, res) => res.json({ ok: true }));

  // One long-lived stream per browser tab; starts with a snapshot of current state.
  router.get('/events', (req, res) => {
    events.attach(res, [
      ['comfy', comfy.engine.status()],
      ['llm', llm.engine.status()],
      ['settings', settings.get()],
      ['gpu', gpuMonitor.latest],
    ]);
  });

  // Everything the Home page shows, in one request.
  router.get('/overview', async (req, res) => {
    const history = comfy.jobs.history.data;
    const models = await comfy.options.get().catch(() => null); // null while ComfyUI is offline
    res.json({
      comfy: comfy.engine.status(),
      llm: llm.engine.status(),
      llmModels: llm.engine.listModels(),
      gpu: gpuMonitor.latest ?? (await gpuMonitor.poll()),
      settings: settings.get(),
      images: {
        total: history.length,
        recent: history.slice(0, 8),
        checkpoints: models?.checkpoints.length ?? null,
        loras: models?.loras.length ?? null,
      },
      chats: { total: llm.chats.chats.length, recent: llm.chats.list().slice(0, 5) },
    });
  });

  router.get('/settings', (req, res) => res.json(settings.get()));

  router.put('/settings', (req, res) => {
    const { gpuMode } = req.body ?? {};
    res.json(settings.update({ gpuMode: oneOf(gpuMode, 'gpuMode', ['auto', 'manual']) }));
  });

  return router;
}
