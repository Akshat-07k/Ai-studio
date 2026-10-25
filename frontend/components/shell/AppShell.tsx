'use client';

import type { ReactNode } from 'react';
import { EventsProvider } from '@/components/providers/EventsProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { NavBar } from './NavBar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <EventsProvider>
        <div className="shell">
          <NavBar />
          <main className="shell-main">{children}</main>
        </div>
      </EventsProvider>
    </ToastProvider>
  );
}
