'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSystem } from '@/components/providers/EventsProvider';
import type { EngineState } from '@/lib/types/system';
import { GpuMeter } from './GpuMeter';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/image', label: 'Image Studio' },
  { href: '/chat', label: 'Chat' },
];

const DOT: Record<EngineState, string> = { ready: 'green', starting: 'amber pulse', stopped: 'grey', error: 'red' };

function EngineDot({ label, state, title }: { label: string; state: EngineState | undefined; title: string }) {
  return (
    <span className="engine-dot" title={title}>
      <span className={`dot ${state ? DOT[state] : 'grey'}`} />
      {label}
    </span>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { connection, comfy, llm, gpu } = useSystem();

  return (
    <header className="navbar">
      <Link href="/" className="brand">
        <span className="logo">◐</span> Local AI Studio
      </Link>
      <nav className="nav-links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="nav-status">
        {connection === 'down' ? (
          <span className="engine-dot error">
            <span className="dot red" /> Backend offline - run <code>npm run dev</code> in Interface
          </span>
        ) : (
          <>
            <EngineDot label="SDXL" state={comfy?.state} title={`Image engine (ComfyUI): ${comfy?.state ?? '…'}`} />
            <EngineDot label="LLM" state={llm?.state} title={`Chat engine (llama.cpp): ${llm?.state ?? '…'}`} />
            <GpuMeter gpu={gpu} compact />
          </>
        )}
      </div>
    </header>
  );
}
