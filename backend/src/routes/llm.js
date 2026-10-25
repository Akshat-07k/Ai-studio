// The llama.cpp server: status, available models, load/unload and settings.
import { Router } from 'express';
import { ValidationError } from '../utils/errors.js';
import { num, pick, str } from '../utils/validate.js';

function validateSettings(body, models) {
  return pick(body, {
    model: (v) => {
      const model = str(v, 'Model', { required: true });
      if (!models.some((m) => m.file === model)) throw new ValidationError(`Model "${model}" was not found`);
      return model;
    },
    contextSize: (v) => num(v, 'Context size', { min: 512, max: 262_144, integer: true }),
    gpuLayers: (v) => (v === 'auto' || v === 'all' ? v : num(v, 'GPU layers', { min: 0, max: 999, integer: true })),
  });
}

export function llmRoutes({ llm, gpu, settings }) {
  const { engine } = llm;
  const router = Router();

  router.get('/', (req, res) => res.json(engine.status()));

  router.get('/models', (req, res) => res.json(engine.listModels()));

  router.get('/logs', (req, res) => res.json({ lines: engine.logs.lines }));

  router.put('/settings', (req, res) => {
    settings.update({ llm: validateSettings(req.body, engine.listModels()) });
    res.json(engine.status());
  });

  // Saves any settings in the body, then (re)loads the model. Responds right away;
  // progress arrives on the event feed as `llm` status updates.
  router.post('/start', async (req, res) => {
    const changes = validateSettings(req.body ?? {}, engine.listModels());
    if (Object.keys(changes).length) settings.update({ llm: changes });
    await gpu.prepareForLlm();
    engine.start().catch(() => {}); // failures are reported through the engine status
    res.status(202).json(engine.status());
  });

  router.post('/stop', async (req, res) => {
    await engine.stop();
    res.json(engine.status());
  });

  return router;
}
