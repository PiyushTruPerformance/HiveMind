'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Blocks, LayoutGrid, Settings, ShieldCheck } from 'lucide-react'

import { OSTile } from '@/components/common/os-tile'
import { BrandMark } from '@/components/common/brand-mark'
import { Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { cn } from '@/lib/utils/cn'
import { OS_LIST } from '@/platform/config/os-registry'
import { BRAND } from '@/platform/config/brand'

/**
 * The product rail.
 *
 * This is the platform's spine: every OS the organization could have is present
 * at all times, in a fixed order, whether or not the current plan unlocks it.
 * Locked products stay clickable and land on their own page explaining why —
 * a dead icon teaches nothing, an explained one sells the upgrade.
 */
export function OSRail() {
  const pathname = usePathname() ?? ''
  const access = useAccess()

  return (
    <nav
      aria-label="Products"
      className="hidden w-[68px] shrink-0 flex-col items-center gap-1 border-r bg-surface-sunken py-3 lg:flex"
    >
      <Tooltip content={`${BRAND.name} home`} side="right">
        <Link
          href="/app"
          className="mb-1 flex size-10 items-center justify-center rounded-lg bg-foreground text-background transition-transform hover:scale-105"
          aria-label={`${BRAND.name} home`}
        >
          <BrandMark className="size-5" />
        </Link>
      </Tooltip>

      <RailLink
        href="/app"
        label="All products"
        icon={LayoutGrid}
        active={pathname === '/app'}
      />

      <div className="my-1.5 h-px w-8 bg-border" />

      <div className="flex flex-col items-center gap-1.5">
        {OS_LIST.map((os) => {
          const verdict = access.osAccess(os.id)
          const active = pathname.startsWith(`/app/os/${os.id}`)
          return (
            <Tooltip
              key={os.id}
              side="right"
              content={
                <span className="block">
                  <span className="font-medium text-foreground">{os.name}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {verdict.allowed ? os.tagline : verdict.message}
                  </span>
                </span>
              }
            >
              <Link
                href={`/app/os/${os.id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex size-11 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-surface shadow-xs' : 'hover:bg-surface',
                )}
              >
                <span
                  className={cn(
                    'absolute -left-3 h-6 w-1 rounded-r-full bg-primary transition-all',
                    active ? 'opacity-100' : 'h-0 opacity-0',
                  )}
                  aria-hidden
                />
                <OSTile os={os} size="md" locked={!verdict.allowed} />
              </Link>
            </Tooltip>
          )
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailLink
          href="/app/integrations"
          label="Integrations"
          icon={Blocks}
          active={pathname.startsWith('/app/integrations')}
        />
        {access.can('superadmin:console') || access.can('admin:console') ? (
          <RailLink
            href="/app/admin"
            label="Global administration"
            icon={ShieldCheck}
            active={pathname.startsWith('/app/admin')}
          />
        ) : null}
        <RailLink
          href="/app/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith('/app/settings')}
        />
      </div>
    </nav>
  )
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
}) {
  return (
    <Tooltip content={label} side="right">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex size-10 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:bg-surface hover:text-foreground',
        )}
      >
        <Icon className="size-[18px]" />
      </Link>
    </Tooltip>
  )
}
