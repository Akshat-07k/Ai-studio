'use client';

import { useEffect, useState } from 'react';
import { displayName, formatBytes } from '@/lib/format';
import type { ChatSettings } from '@/lib/types/chat';
import type { GpuLayers, LlmModel, LlmSettings, LlmStatus } from '@/lib/types/system';
import { Field, Section, SliderField } from '@/components/ui/Controls';

const CONTEXT_SIZES = [4096, 8192, 16384, 32768, 65536, 131072];

export function SettingsPanel({
  chatSettings,
  onChatSettings,
  llm,
  models,
  onApplyServer,
  onClose,
}: {
  chatSettings: ChatSettings | null;
  onChatSettings: (patch: Partial<ChatSettings>) => void;
  llm: LlmStatus | null;
  models: LlmModel[];
  onApplyServer: (settings: LlmSettings) => void;
  onClose: () => void;
}) {
  const [server, setServer] = useState<LlmSettings | null>(llm?.settings ?? null);
  useEffect(() => {
    if (!server && llm) setServer({ ...llm.settings, model: llm.settings.model || llm.selectedModel || '' });
  }, [llm, server]);

  const customLayers = typeof server?.gpuLayers === 'number';

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer settings-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="section-head">
          <h2>Chat settings</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="drawer-scroll">
          {chatSettings ? (
            <Section title="This conversation">
              <Field label="System prompt" hint="instructions the model always follows">
                <textarea
                  rows={4}
                  value={chatSettings.systemPrompt}
                  onChange={(e) => onChatSettings({ systemPrompt: e.target.value })}
                />
              </Field>
              <label className="check toggle-row">
                <input
                  type="checkbox"
                  checked={chatSettings.thinking}
                  onChange={(e) => onChatSettings({ thinking: e.target.checked })}
                />
                <span>
                  <strong>Thinking mode</strong>
                  <span className="hint block">
                    The model reasons step by step before answering. Better for hard questions, but much slower (it can
                    think for hundreds of tokens).
                  </span>
                </span>
              </label>
              <SliderField
                label="Temperature"
                hint="higher = more creative"
                value={chatSettings.temperature}
                min={0}
                max={2}
                step={0.05}
                onChange={(temperature) => onChatSettings({ temperature })}
              />
              <SliderField
                label="Top P"
                hint="limits word choices to the most likely"
                value={chatSettings.topP}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(topP) => onChatSettings({ topP })}
              />
              <Field label="Max reply length" hint="tokens, 0 = no limit">
                <input
                  type="number"
                  min={0}
                  step={256}
                  value={chatSettings.maxTokens}
                  onChange={(e) => onChatSettings({ maxTokens: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </Field>
            </Section>
          ) : (
            <p className="muted small">Open or start a conversation to change its settings.</p>
          )}

          {server && (
            <Section title="Model server (llama.cpp)">
              <Field label="Model" hint={`.gguf files in ${llm?.modelsDir ?? 'models'}`}>
                <select value={server.model} onChange={(e) => setServer({ ...server, model: e.target.value })}>
                  {models.map((m) => (
                    <option key={m.file} value={m.file}>
                      {displayName(m.file)} ({formatBytes(m.sizeBytes)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Context size" hint="how much text it can see at once">
                <select
                  value={server.contextSize}
                  onChange={(e) => setServer({ ...server, contextSize: Number(e.target.value) })}
                >
                  {CONTEXT_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n / 1024}K tokens (~{Math.round((n * 0.75) / 1000)}K words)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="GPU layers">
                <div className="row">
                  <select
                    value={customLayers ? 'custom' : String(server.gpuLayers)}
                    onChange={(e) => {
                      const v = e.target.value;
                      const gpuLayers: GpuLayers = v === 'custom' ? 24 : (v as 'auto' | 'all');
                      setServer({ ...server, gpuLayers });
                    }}
                  >
                    <option value="auto">Auto: fit to free VRAM (recommended)</option>
                    <option value="all">All layers on GPU</option>
                    <option value="custom">Custom number</option>
                  </select>
                  {customLayers && (
                    <input
                      type="number"
                      className="num"
                      min={0}
                      max={999}
                      value={server.gpuLayers as number}
                      onChange={(e) => setServer({ ...server, gpuLayers: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  )}
                </div>
              </Field>
              <p className="hint">
                Auto lets llama.cpp put as many layers on the GPU as fit, keeping the rest on the CPU. Forcing
                &quot;all&quot; when VRAM is short makes Windows spill into system RAM, which roughly halves the speed.
              </p>
              <button className="btn primary full" onClick={() => onApplyServer(server)}>
                {llm?.state === 'ready' ? 'Apply & reload model' : 'Save & load model'}
              </button>
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}
