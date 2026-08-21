import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google'
import type { ReactNode } from 'react'

import { ClerkGate } from '@/components/common/clerk-gate'
import { BRAND } from '@/platform/config/brand'
import { Providers } from '@/lib/state/providers'

import './globals.css'

/**
 * Type pairing carried over from the existing product design system:
 * Space Grotesk for display, Plus Jakarta Sans for body.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#131211' },
  ],
}

/**
 * Applies the persisted theme before first paint so a dark-mode user never sees
 * a light flash. Kept inline and tiny; it is the only script in the document.
 */
const THEME_BOOTSTRAP = `
(function(){try{
var v=localStorage.getItem('hivex:theme');
var t=v?JSON.parse(v):'system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}
}catch(e){}})();
`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <ClerkGate>
          <Providers>{children}</Providers>
        </ClerkGate>
      </body>
    </html>
  )
}
