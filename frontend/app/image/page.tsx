'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, imageUrl, inputImageUrl } from '@/lib/api';
import { toSourcePng } from '@/lib/imageFile';
import type { EngineOptions, ImageRef, Job, LoraMeta } from '@/lib/types/image';
import { useEvent, useSystem } from '@/components/providers/EventsProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { EngineBar } from '@/components/image/EngineBar';
import { GenerateForm, type FormState } from '@/components/image/GenerateForm';
import { newLoraRow } from '@/components/image/LoraList';
import { Gallery, QueueStrip } from '@/components/image/Gallery';
import { Stage } from '@/components/image/Stage';
import { MaskEditor } from '@/components/image/MaskEditor';
import { Lightbox, LogsDrawer } from '@/components/ui/Overlays';
import { IMAGE_FORM_KEY as FORM_KEY } from '@/lib/storageKeys';

function initialForm(options: EngineOptions, saved: Partial<FormState> | null): FormState {
  const base: FormState = {
    ...options.defaults,
    source: null,
    mask: null,
    checkpoint: options.checkpoints[0] ?? '',
    loras: [],
    randomSeed: true,
    seed: 0,
  };
  const form = { ...base, ...(saved ?? {}) };
  form.source ??= null; // history entries from before img2img don't have these
  form.mask = form.source ? (form.mask ?? null) : null;
  if (!options.checkpoints.includes(form.checkpoint)) form.checkpoint = base.checkpoint;
  if (form.vae && !options.vaes.includes(form.vae)) form.vae = '';
  if (!options.samplers.includes(form.sampler)) form.sampler = base.sampler;
  if (!options.schedulers.includes(form.scheduler)) form.scheduler = base.scheduler;
  form.loras = (form.loras ?? []).map((l) => ({ ...newLoraRow(l.name), ...l, key: crypto.randomUUID() }));
  return form;
}

export default function ImageStudioPage() {
  const toast = useToast();
  const { comfy: engine } = useSystem();
  const [options, setOptions] = useState<EngineOptions | null>(null);
  const [loraMeta, setLoraMeta] = useState<LoraMeta>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [active, setActive] = useState<Record<string, Job>>({});
  const [ended, setEnded] = useState<Record<string, Job>>({}); // failed/cancelled this session
  const [history, setHistory] = useState<Job[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const followLive = useRef(true);

  // ---------- data loading ----------

  const loadJobs = useCallback(async () => {
    const data = await api.image.jobs();
    setActive(Object.fromEntries(data.active.map((j) => [j.id, j])));
    setHistory(data.history);
    setSelectedId((id) => id ?? data.active[0]?.id ?? data.history[0]?.id ?? null);
  }, []);

  const loadAll = useCallback(() => {
    loadJobs().catch(() => {});
    api.image.loraMeta().then(setLoraMeta).catch(() => {});
  }, [loadJobs]);

  useEffect(loadAll, [loadAll]);
  useEvent('open', loadAll); // refetch after the event feed reconnects

  // (Re)load models whenever the engine becomes ready.
  useEffect(() => {
    if (engine?.state !== 'ready') return;
    api.image
      .options(true)
      .then((opts) => {
        setOptions(opts);
        setForm((current) => {
          if (current) return current;
          let saved: Partial<FormState> | null = null;
          try {
            saved = JSON.parse(localStorage.getItem(FORM_KEY) ?? 'null');
          } catch {
            // ignore corrupted storage
          }
          return initialForm(opts, saved);
        });
      })
      .catch((e: Error) => toast('error', e.message));
  }, [engine?.state, toast]);

  useEffect(() => {
    if (form) localStorage.setItem(FORM_KEY, JSON.stringify(form));
  }, [form]);

  // ---------- live events ----------

  useEvent<{ jobId: string; dataUrl: string }>('preview', ({ jobId, dataUrl }) =>
    setPreviews((p) => ({ ...p, [jobId]: dataUrl }))
  );

  useEvent<Job>('job', (job) => {
    if (job.status === 'queued' || job.status === 'running') {
      setActive((a) => ({ ...a, [job.id]: job }));
      if (job.status === 'running' && followLive.current) setSelectedId(job.id);
      return;
    }
    setActive(({ [job.id]: _, ...rest }) => rest);
    setPreviews(({ [job.id]: _, ...rest }) => rest);
    if (job.status === 'done') {
      setHistory((h) => (h.some((x) => x.id === job.id) ? h : [job, ...h]));
    } else {
      setEnded((x) => ({ ...x, [job.id]: job }));
      if (job.status === 'error') toast('error', job.error ?? 'Generation failed');
    }
    if (followLive.current) setSelectedId(job.id);
  });

  useEvent<{ id: string }>('job-removed', ({ id }) => setActive(({ [id]: _, ...rest }) => rest));
  useEvent<{ id: string }>('history-removed', ({ id }) => setHistory((h) => h.filter((j) => j.id !== id)));

  // ---------- actions ----------

  const update = useCallback((patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f)), []);

  const generate = async () => {
    if (!form) return;
    setSubmitting(true);
    try {
      const { randomSeed, loras, ...rest } = form;
      const job = await api.image.generate({
        ...rest,
        seed: randomSeed ? -1 : form.seed,
        loras: loras.map(({ key, ...l }) => l),
      });
      followLive.current = true;
      setActive((a) => ({ ...a, [job.id]: a[job.id] ?? job }));
      setSelectedId(job.id);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // img2img: any picture (file, paste, or one of our results) -> SDXL-sized PNG in ComfyUI's input folder.
  const setSourceFrom = useCallback(
    async (src: Blob | string) => {
      setUploading(true);
      try {
        const { filename, subfolder, width, height } = await api.image.upload(await toSourcePng(src), 'source');
        update({ source: { filename, subfolder, width, height }, mask: null });
        return true;
      } catch (e) {
        toast('error', (e as Error).message);
        return false;
      } finally {
        setUploading(false);
      }
    },
    [update, toast]
  );

  const editResult = (img: ImageRef) =>
    setSourceFrom(imageUrl(img)).then(
      (ok) => ok && toast('info', 'Loaded as the source image. Describe the result you want, then Generate.')
    );

  // Ctrl+V anywhere on the page (except while typing in a field) pastes an image as the source.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      setSourceFrom(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [setSourceFrom]);

  // Throws on failure so the editor stays open with the strokes intact.
  const saveMask = async (png: Blob | null) => {
    if (png) {
      try {
        const { filename, subfolder } = await api.image.upload(png, 'mask');
        update({ mask: { filename, subfolder } });
      } catch (e) {
        toast('error', (e as Error).message);
        throw e;
      }
    } else {
      update({ mask: null });
    }
    setMaskEditorOpen(false);
  };

  const cancel = (id: string) => api.image.cancel(id).catch((e: Error) => toast('error', e.message));

  const reuse = (job: Job) => {
    if (!options) return;
    const { params } = job;
    setForm(
      initialForm(options, {
        ...params,
        randomSeed: false,
        loras: params.loras.map((l) => ({
          ...newLoraRow(l.name),
          strength: l.strength,
          clipStrength: l.clipStrength === l.strength ? null : l.clipStrength,
        })),
      })
    );
    toast('info', 'Settings loaded into the form');
  };

  const selectJob = (id: string) => {
    followLive.current = false;
    setSelectedId(id);
  };

  const removeFromHistory = (id: string) => {
    api.image.removeFromHistory(id).catch((e: Error) => toast('error', e.message));
    if (selectedId === id) setSelectedId(null);
  };

  const saveTrigger = (name: string, words: string) =>
    api.image
      .saveLoraMeta(name, words)
      .then(setLoraMeta)
      .catch((e: Error) => toast('error', e.message));

  const refreshModels = () =>
    api.image
      .options(true)
      .then((opts) => {
        setOptions(opts);
        toast('info', `${opts.checkpoints.length} checkpoints, ${opts.loras.length} LoRAs`);
      })
      .catch((e: Error) => toast('error', e.message));

  const engineAction = (fn: () => Promise<unknown>, okText?: string) =>
    fn()
      .then(() => okText && toast('success', okText))
      .catch((e: Error) => toast('error', e.message));

  // ---------- derived ----------

  const activeJobs = useMemo(() => Object.values(active).sort((a, b) => a.createdAt - b.createdAt), [active]);
  const selectedJob =
    (selectedId && (active[selectedId] ?? ended[selectedId] ?? history.find((j) => j.id === selectedId))) || null;
  const queuePosition = selectedJob
    ? activeJobs.filter((j) => j.status === 'queued').findIndex((j) => j.id === selectedJob.id) + 1
    : 0;
  const canGenerate = Boolean(engine?.state === 'ready' && form?.checkpoint && form.positive.trim() && !submitting);

  return (
    <div className="studio">
      <aside className="sidebar">
        {form && options ? (
          <GenerateForm
            form={form}
            update={update}
            options={options}
            loraMeta={loraMeta}
            onSaveTrigger={saveTrigger}
            onRefreshModels={refreshModels}
            onGenerate={generate}
            canGenerate={canGenerate}
            activeCount={activeJobs.length}
            uploading={uploading}
            onSourceFile={setSourceFrom}
            onEditMask={() => setMaskEditorOpen(true)}
          />
        ) : (
          <div className="sidebar-wait">
            <div className="spinner" />
            <p className="muted">Waiting for the image engine…</p>
          </div>
        )}
      </aside>

      <section className="content">
        <div className="page-toolbar">
          <h1>Image Studio</h1>
          <EngineBar
            engine={engine}
            onStart={() => engineAction(api.image.startEngine)}
            onStop={() => engineAction(api.image.stopEngine, 'Image engine stopped, GPU memory released')}
            onFree={() => engineAction(api.image.freeMemory, 'Image models unloaded from VRAM')}
            onLogs={() => setLogsOpen(true)}
          />
        </div>
        <Stage
          job={selectedJob}
          preview={selectedJob ? (previews[selectedJob.id] ?? null) : null}
          queuePosition={queuePosition}
          onCancel={cancel}
          onReuse={reuse}
          onUseSeed={(seed) => {
            update({ seed, randomSeed: false });
            toast('info', `Seed ${seed} set`);
          }}
          onOpen={setLightbox}
          onEdit={editResult}
          editing={uploading}
        />
        <QueueStrip jobs={activeJobs} onSelect={selectJob} onCancel={cancel} />
        <Gallery jobs={history} selectedId={selectedId} onSelect={selectJob} onRemove={removeFromHistory} />
      </section>

      {logsOpen && (
        <LogsDrawer
          title="Image engine logs"
          load={api.image.engineLogs}
          emptyText="No output yet. (When attached to ComfyUI Desktop, its logs live in the Desktop app.)"
          onClose={() => setLogsOpen(false)}
        />
      )}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
      {maskEditorOpen && form?.source && (
        <MaskEditor
          key={form.source.filename}
          imageUrl={inputImageUrl(form.source)}
          width={form.source.width}
          height={form.source.height}
          maskUrl={form.mask ? inputImageUrl(form.mask) : null}
          onSave={saveMask}
          onClose={() => setMaskEditorOpen(false)}
        />
      )}
    </div>
  );
}
