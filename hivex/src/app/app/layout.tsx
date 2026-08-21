'use client'

import type { ReactNode } from 'react'

import { AppShell } from '@/components/shell/app-shell'

/**
 * Every authenticated route lives under /app and shares one shell. Products
 * render into it; they never replace it.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
