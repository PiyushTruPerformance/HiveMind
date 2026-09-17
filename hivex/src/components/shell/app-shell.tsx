'use client'

import { AnimatePresence, motion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { AssistantDock } from '@/components/assistant/assistant-dock'
import { BrandLockup } from '@/components/common/brand-mark'
import { Button } from '@/components/ui/button'
import { useAccess } from '@/lib/access/useAccess'
import { useIdentity } from '@/lib/state/identity-provider'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { initialsOf, slugify } from '@/lib/utils/format'
// TEMPORARY REPORTING OS EMBED — remove with the embed (see below).
import { isEmbeddedReportingPath } from '@/os/reporting/embed'

import { CommandPalette, useCommandPalette } from './command-palette'
import { ContextSidebar } from './context-sidebar'
import { OSRail } from './os-rail'
import { TopBar } from './top-bar'

/**
 * The application shell.
 *
 * Four regions, fixed for the life of the session:
 *   rail       — every product, always reachable
 *   sidebar    — context for wherever you are
 *   content    — the work
 *   assistant  — a dockable column, not an overlay
 *
 * The shell is platform-level and knows nothing about any specific OS. Products
 * render into `children`; they do not get to restyle the frame.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { hydrated, organization, setOrganization } = usePlatform()
  const identity = useIdentity()
  const command = useCommandPalette()
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname() ?? ''
  const access = useAccess()

  /*
   * TEMPORARY REPORTING OS EMBED
   *
   * While the deployed Tru Reporting OS is embedded (native HiveX Reporting OS
   * temporarily disabled — see src/os/reporting/embed.ts), its pages take the
   * whole content area next to the OS rail: no top bar, no section sidebar, no
   * content padding. Derived from the URL, so direct loads and refreshes match
   * client-side navigation. Only when the product actually opens — a guard
   * redirect or access-denied screen keeps the normal shell.
   *
   * The top bar is hidden at lg and up only: below lg the rail is not shown and
   * the top bar's menu is the only way to switch products.
   *
   * To restore the native Reporting OS, delete `immersive` and its uses below.
   */
  const immersive = isEmbeddedReportingPath(pathname) && access.canOpenOS('reporting')

  /*
   * No onboarding wizard any more. An organization is still the container for
   * everything, so if there isn't one we create a minimal record from the
   * signed-in identity and get out of the way — the user lands on Home and can
   * rename it later in Settings. Waits for hydration so a refresh never
   * re-provisions over a real organization.
   */
  useEffect(() => {
    if (!hydrated || organization) return
    const domain = identity.user.email.split('@')[1] ?? 'workspace.local'
    const base = domain.split('.')[0]
    const name = base.charAt(0).toUpperCase() + base.slice(1)
    setOrganization({
      id: `org_${slugify(name) || 'workspace'}`,
      name,
      slug: slugify(name) || 'workspace',
      domain,
      industry: 'Other',
      size: '1-10',
      monogram: initialsOf(name),
      accent: '14 100% 57%',
      createdAt: new Date().toISOString(),
    })
  }, [hydrated, organization, identity.user.email, setOrganization])

  if (!hydrated || !organization) return <ShellSkeleton />

  return (
    <div className="flex h-dvh overflow-hidden">
      <OSRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn('contents', immersive && 'lg:hidden')}>
          <TopBar onOpenCommand={() => command.setOpen(true)} onOpenNav={() => setNavOpen(true)} />
        </div>

        <div className="flex min-h-0 flex-1">
          {!immersive ? (
            <aside className="hidden w-60 shrink-0 border-r bg-surface lg:block" aria-label="Section navigation">
              <ContextSidebar />
            </aside>
          ) : null}

          <main className={cn('scrollbar-thin min-w-0 flex-1', immersive ? 'overflow-hidden' : 'overflow-y-auto')}>
            {immersive ? (
              <div className="size-full">{children}</div>
            ) : (
              <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
            )}
          </main>

          <AssistantDock />
        </div>
      </div>

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
      <CommandPalette open={command.open} onOpenChange={command.setOpen} />
    </div>
  )
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r bg-surface shadow-pop"
            role="dialog"
            aria-label="Navigation"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
              <BrandLockup />
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close navigation">
                <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
                  <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <ContextSidebar onNavigate={onClose} />
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh">
      <div className="hidden w-[68px] shrink-0 border-r bg-surface-sunken lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="h-14 shrink-0 border-b" />
        <div className="flex flex-1">
          <div className="hidden w-60 shrink-0 border-r bg-surface lg:block" />
          <div className={cn('flex-1 p-8')}>
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
              <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
