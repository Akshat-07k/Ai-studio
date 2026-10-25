import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import '@/styles/base.css';
import '@/styles/shell.css';
import '@/styles/home.css';
import '@/styles/image.css';
import '@/styles/chat.css';

export const metadata: Metadata = {
  title: 'Local AI Studio',
  description: 'SDXL image generation (ComfyUI) and local LLM chat (llama.cpp), running on your own GPU.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions often inject attributes into <body>; don't treat that as a hydration error. */}
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
