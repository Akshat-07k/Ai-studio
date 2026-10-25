'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type Overview } from '@/lib/api';
import { useEvent, useSystem } from '@/components/providers/EventsProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ChatCard, ImageCard } from '@/components/home/ToolCards';
import { GpuPanel } from '@/components/home/GpuPanel';
import { HowItWorks } from '@/components/home/HowItWorks';
import type { AppSettings } from '@/lib/types/system';

export default function HomePage() {
  const toast = useToast();
  const live = useSystem();
  const [overview, setOverview] = useState<Overview | null>(null);

  const load = useCallback(() => {
    api.system
      .overview()
      .then(setOverview)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useEvent('open', load);
  // Model counts need the image engine; refresh once it's ready.
  useEffect(() => {
    if (live.comfy?.state === 'ready') load();
  }, [live.comfy?.state, load]);

  // Live values from the event feed win over the snapshot.
  const comfy = live.comfy ?? overview?.comfy ?? null;
  const llm = live.llm ?? overview?.llm ?? null;
  const gpu = live.gpu ?? overview?.gpu ?? null;
  const gpuMode = live.settings?.gpuMode ?? overview?.settings.gpuMode;

  const setGpuMode = (mode: AppSettings['gpuMode']) =>
    api.system.setGpuMode(mode).catch((e: Error) => toast('error', e.message));

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">{gpu ? `Running locally on ${gpu.name}` : 'Running locally'}</p>
        <h1>Your private AI studio</h1>
        <p className="lead">
          Create images with Stable Diffusion XL and chat with a local language model. Both run entirely on this
          laptop: no cloud, no account, nothing leaves your machine.
        </p>
        <div className="hero-actions">
          <Link href="/image" className="btn primary big">
            Generate an image
          </Link>
          <Link href="/chat" className="btn big">
            Start a chat
          </Link>
        </div>
      </section>

      <div className="cards">
        <ImageCard overview={overview} comfy={comfy} />
        <ChatCard
          overview={overview}
          llm={llm}
          onLoad={() => api.llm.start().catch((e: Error) => toast('error', e.message))}
          onUnload={() => api.llm.stop().catch((e: Error) => toast('error', e.message))}
        />
      </div>

      <GpuPanel gpu={gpu} comfy={comfy} llm={llm} gpuMode={gpuMode} onModeChange={setGpuMode} />
      <HowItWorks />
    </div>
  );
}
