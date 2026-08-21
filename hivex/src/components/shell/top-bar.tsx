'use client'

import Link from 'next/link'
import { ChevronRight, Menu as MenuIcon, Search, Sparkles } from 'lucide-react'

import { OSTile } from '@/components/common/os-tile'
import { Avatar, Kbd, Tooltip } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'
import { useAssistant } from '@/lib/state/assistant-provider'
import { usePlatform } from '@/lib/state/platform-provider'
import { useRouteContext } from '@/lib/state/use-route-context'
import { cn } from '@/lib/utils/cn'
import { findNavItem } from '@/platform/config/os-registry'

import { UserMenu } from './user-menu'
import { WorkspaceSwitcher } from './workspace-switcher'

/**
 * Top bar.
 *
 * Left half answers "where am I" — organization, product, workspace, section.
 * Right half answers "what can I do from anywhere" — search and the assistant.
 * The assistant sits here, at full label width, rather than as a floating bubble:
 * it is a product surface, not an afterthought.
 */
export function TopBar({
  onOpenCommand,
  onOpenNav,
}: {
  onOpenCommand: () => void
  onOpenNav: () => void
}) {
  const { organization } = usePlatform()
  const route = useRouteContext()
  const assistant = useAssistant()

  const section = route.os && route.sectionId ? findNavItem(route.os, route.sectionId) : undefined

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <MenuIcon />
      </Button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1">
        <Link
          href="/app"
          className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
        >
          {organization ? (
            <Avatar
              name={organization.name}
              hue={organization.accent}
              src={organization.logoUrl}
              size="sm"
              square
            />
          ) : null}
          <span className="hidden max-w-40 truncate text-[13px] font-medium sm:block">
            {organization?.name ?? 'Your organization'}
          </span>
        </Link>

        {route.os ? (
          <>
            <Crumb />
            <Link
              href={`/app/os/${route.os.id}`}
              className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
            >
              <OSTile os={route.os} size="sm" />
              <span className="hidden text-[13px] font-medium md:block">{route.os.shortName}</span>
            </Link>
          </>
        ) : null}

        {route.os && route.os.supportsWorkspaces ? (
          <>
            <Crumb />
            <WorkspaceSwitcher osId={route.os.id} current={route.workspace} />
          </>
        ) : null}

        {section && section.id ? (
          <>
            <Crumb className="hidden lg:flex" />
            <span className="hidden truncate text-[13px] text-muted-foreground lg:block">
              {section.label}
            </span>
          </>
        ) : null}
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenCommand}
          className={cn(
            'hidden h-9 w-56 items-center gap-2 rounded-md border bg-surface px-2.5 text-left text-[13px] text-muted-foreground',
            'transition-colors hover:border-border-strong xl:flex',
          )}
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate">Search…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <Tooltip content="Search — ⌘K">
          <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={onOpenCommand} aria-label="Search">
            <Search />
          </Button>
        </Tooltip>

        {/* Hidden entirely on client pages — see platform/config/ask-tru.ts. */}
        {assistant.available ? (
          <Button
            variant={assistant.open ? 'subtle' : 'primary'}
            size="sm"
            onClick={assistant.toggle}
            aria-expanded={assistant.open}
            className="gap-2"
          >
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">{ASK_TRU_NAME}</span>
          </Button>
        ) : null}

        <div className="ml-1">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

function Crumb({ className }: { className?: string }) {
  return (
    <ChevronRight
      className={cn('size-3.5 shrink-0 text-muted-foreground/60', className)}
      aria-hidden
    />
  )
}

/** Small plan pill used on the platform home header. */
export function PlanPill({ label }: { label: string }) {
  return (
    <Badge tone="neutral" className="uppercase tracking-wider">
      {label}
    </Badge>
  )
}
