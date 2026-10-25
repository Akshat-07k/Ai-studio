'use client';

import type { KeyboardEvent } from 'react';
import { displayName, SDXL_SIZES } from '@/lib/format';
import type { EngineOptions, GenerateParams, LoraMeta } from '@/lib/types/image';
import { Field, Section, Select, SliderField } from '@/components/ui/Controls';
import { LoraList, type LoraRow } from './LoraList';
import { SourcePicker } from './SourcePicker';

export type FormState = Omit<GenerateParams, 'loras'> & { loras: LoraRow[]; randomSeed: boolean };

export function GenerateForm({
  form,
  update,
  options,
  loraMeta,
  onSaveTrigger,
  onRefreshModels,
  onGenerate,
  canGenerate,
  activeCount,
  uploading,
  onSourceFile,
  onEditMask,
}: {
  form: FormState;
  update: (patch: Partial<FormState>) => void;
  options: EngineOptions;
  loraMeta: LoraMeta;
  onSaveTrigger: (name: string, words: string) => void;
  onRefreshModels: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
  activeCount: number;
  uploading: boolean;
  onSourceFile: (file: File) => void;
  onEditMask: () => void;
}) {
  const insertIntoPrompt = (text: string) => {
    const current = form.positive.trim();
    if (current.toLowerCase().includes(text.toLowerCase())) return;
    update({ positive: current ? `${text}, ${current}` : text });
  };

  const onPromptKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (canGenerate) onGenerate();
    }
  };

  const batchField = (
    <Field label="Batch">
      <input
        type="number"
        min={1}
        max={8}
        value={form.batchSize}
        onChange={(e) => update({ batchSize: Math.max(1, Number(e.target.value) || 1) })}
      />
    </Field>
  );

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate();
      }}
    >
      <div className="form-scroll">
        <Section
          title="Model"
          aside={
            <button type="button" className="link-btn" title="Re-scan model folders" onClick={onRefreshModels}>
              ↻ Refresh models
            </button>
          }
        >
          <Field label="Checkpoint">
            <Select
              value={form.checkpoint}
              options={options.checkpoints}
              format={displayName}
              onChange={(checkpoint) => update({ checkpoint })}
            />
          </Field>
          <div className="row">
            <Field label="VAE">
              <Select
                value={form.vae}
                options={options.vaes}
                format={displayName}
                placeholder="Built into checkpoint"
                onChange={(vae) => update({ vae })}
              />
            </Field>
            <Field label="CLIP skip" hint="2 for anime / Pony">
              <input
                type="number"
                min={1}
                max={12}
                value={form.clipSkip}
                onChange={(e) => update({ clipSkip: Math.max(1, Number(e.target.value) || 1) })}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="LoRAs"
          aside={<span className="muted small">{form.loras.filter((l) => l.enabled).length} active</span>}
        >
          <LoraList
            rows={form.loras}
            available={options.loras}
            meta={loraMeta}
            onChange={(loras) => update({ loras })}
            onInsert={insertIntoPrompt}
            onSaveTrigger={onSaveTrigger}
          />
        </Section>

        <Section title="Start from an image" aside={<span className="muted small">optional</span>}>
          <SourcePicker
            fields={form}
            update={update}
            uploading={uploading}
            onFile={onSourceFile}
            onEditMask={onEditMask}
          />
        </Section>

        <Section title="Prompt">
          <Field label="Positive" hint={form.source ? 'describe the result you want, not the change' : undefined}>
            <textarea
              rows={5}
              value={form.positive}
              placeholder={
                form.source
                  ? form.mask
                    ? 'what should appear in the painted area, e.g. a red silk scarf'
                    : 'the whole picture as you want it, e.g. the same street at night, neon lights, rain'
                  : 'masterpiece, best quality, a white marble sculpture of an owl, studio lighting'
              }
              onChange={(e) => update({ positive: e.target.value })}
              onKeyDown={onPromptKey}
            />
          </Field>
          <Field label="Negative">
            <textarea
              rows={3}
              value={form.negative}
              onChange={(e) => update({ negative: e.target.value })}
              onKeyDown={onPromptKey}
            />
          </Field>
        </Section>

        <Section title="Image size">
          {form.source ? (
            <>
              <p className="muted small source-size-note">
                Uses the source image&apos;s size: {form.source.width}×{form.source.height}
              </p>
              <div className="row">{batchField}</div>
            </>
          ) : (
            <>
              <div className="sizes">
                {SDXL_SIZES.map((s) => {
                  const active = s.width === form.width && s.height === form.height;
                  const scale = 22 / Math.max(s.width, s.height);
                  return (
                    <button
                      type="button"
                      key={s.label}
                      className={`size ${active ? 'active' : ''}`}
                      title={`${s.width}×${s.height}`}
                      onClick={() => update({ width: s.width, height: s.height })}
                    >
                      <span className="size-box" style={{ width: s.width * scale, height: s.height * scale }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <div className="row">
                <Field label="Width">
                  <input
                    type="number"
                    step={64}
                    min={256}
                    max={4096}
                    value={form.width}
                    onChange={(e) => update({ width: Number(e.target.value) })}
                  />
                </Field>
                <button
                  type="button"
                  className="icon-btn swap"
                  title="Swap width and height"
                  onClick={() => update({ width: form.height, height: form.width })}
                >
                  ⇄
                </button>
                <Field label="Height">
                  <input
                    type="number"
                    step={64}
                    min={256}
                    max={4096}
                    value={form.height}
                    onChange={(e) => update({ height: Number(e.target.value) })}
                  />
                </Field>
                {batchField}
              </div>
            </>
          )}
        </Section>

        <Section title="Sampling">
          <SliderField label="Steps" value={form.steps} min={1} max={80} onChange={(steps) => update({ steps })} />
          <SliderField
            label="CFG"
            hint="how strictly to follow the prompt"
            value={form.cfg}
            min={1}
            max={15}
            step={0.5}
            onChange={(cfg) => update({ cfg })}
          />
          <div className="row">
            <Field label="Sampler">
              <Select value={form.sampler} options={options.samplers} onChange={(sampler) => update({ sampler })} />
            </Field>
            <Field label="Scheduler">
              <Select
                value={form.scheduler}
                options={options.schedulers}
                onChange={(scheduler) => update({ scheduler })}
              />
            </Field>
          </div>
          <Field label="Seed">
            <div className="seed-row">
              <input
                type="number"
                min={0}
                value={form.randomSeed ? '' : form.seed}
                placeholder="random"
                disabled={form.randomSeed}
                onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.randomSeed}
                  onChange={(e) => update({ randomSeed: e.target.checked, seed: form.seed < 0 ? 0 : form.seed })}
                />
                Random
              </label>
            </div>
          </Field>
        </Section>
      </div>

      <div className="form-footer">
        <button type="submit" className="btn primary big full" disabled={!canGenerate}>
          {activeCount > 0 ? `Generate (${activeCount} in queue)` : 'Generate'}
        </button>
      </div>
    </form>
  );
}
