// Image generation: the ComfyUI engine, models, jobs and generated files.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import express, { Router } from 'express';
import { UPLOAD_KINDS } from '../services/comfy/uploads.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { oneOf, str } from '../utils/validate.js';

export function imageRoutes({ comfy, events, config }) {
  const { engine, client, options, jobs, uploads } = comfy;
  const router = Router();

  // ---------- engine ----------

  router.get('/engine', (req, res) => res.json(engine.status()));

  router.get('/engine/logs', (req, res) => res.json({ lines: engine.logs.lines }));

  router.post('/engine/start', (req, res) => {
    if (engine.state !== 'ready' && engine.state !== 'starting') engine.start();
    res.json(engine.status());
  });

  router.post('/engine/stop', async (req, res) => {
    if (!engine.managed) {
      throw new ValidationError('This engine was started outside the app (e.g. ComfyUI Desktop); close it there.');
    }
    await engine.stop();
    res.json(engine.status());
  });

  router.post('/engine/free', async (req, res) => {
    await client.freeMemory();
    res.json({ ok: true });
  });

  // ---------- models ----------

  router.get('/options', async (req, res) => {
    res.json(await options.get({ fresh: req.query.fresh === '1' }));
  });

  router.get('/loras/meta', (req, res) => res.json(options.getLoraMeta()));

  router.put('/loras/meta', (req, res) => {
    const name = str(req.body?.name, 'name', { required: true });
    const triggerWords = str(req.body?.triggerWords, 'triggerWords', { max: 500 });
    res.json(options.setTriggerWords(name, triggerWords));
  });

  router.get('/loras/info', async (req, res) => {
    res.json(await options.loraInfo(str(req.query.name, 'name', { required: true })));
  });

  // ---------- img2img / inpainting inputs ----------

  // Body: the PNG bytes. ?kind=source (the image to change) or ?kind=mask (white = redraw).
  router.post('/upload', express.raw({ type: 'image/png', limit: '40mb' }), async (req, res) => {
    const kind = oneOf(req.query.kind, 'kind', UPLOAD_KINDS);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ValidationError('Send the image as a PNG body');
    res.status(201).json(await uploads.save(req.body, kind));
  });

  // ---------- jobs ----------

  router.post('/generate', async (req, res) => {
    res.status(201).json(await jobs.create(req.body ?? {}));
  });

  router.get('/jobs', (req, res) => res.json(jobs.list()));

  router.post('/jobs/:id/cancel', async (req, res) => {
    const job = await jobs.cancel(req.params.id);
    if (!job) throw new NotFoundError('No active job with that id');
    res.json(job);
  });

  router.delete('/history/:id', (req, res) => {
    if (!jobs.removeFromHistory(req.params.id)) throw new NotFoundError();
    events.broadcast('history-removed', { id: req.params.id });
    res.json({ ok: true });
  });

  // Serves generated images: straight from disk when we know the output folder,
  // otherwise proxied through ComfyUI's /view endpoint.
  router.get('/view', async (req, res) => {
    const filename = str(req.query.filename, 'filename', { required: true });
    const subfolder = str(req.query.subfolder, 'subfolder');
    const type = str(req.query.type || 'output', 'type');
    if (req.query.download === '1') res.attachment(path.basename(filename));
    res.set('Cache-Control', 'public, max-age=31536000, immutable');

    const outputDir = config.comfy.outputDir;
    if (outputDir && type === 'output') {
      const root = path.resolve(outputDir);
      const file = path.resolve(root, subfolder, path.basename(filename));
      if (file.startsWith(root + path.sep) && fs.existsSync(file)) return res.sendFile(file);
    }

    const upstream = await client.fetchImage({ filename, subfolder, type });
    if (!upstream.ok) return res.sendStatus(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
    Readable.fromWeb(upstream.body).pipe(res);
  });

  return router;
}
