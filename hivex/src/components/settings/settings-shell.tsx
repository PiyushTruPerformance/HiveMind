'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, CreditCard, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { PageBody, PageHeader, PageTransition } from '@/components/ui/page'
import { cn } from '@/lib/utils/cn'
import type { Capability } from '@/lib/access/permissions'

export interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
  description: string
  capability?: Capability
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'organization',
    label: 'Organization',
    icon: Building2,
    description: 'Name, domain, industry and branding.',
  },
  {
    id: 'plan',
    label: 'Plan and billing',
    icon: CreditCard,
    description: 'What your subscription includes and how much of it you are using.',
    capability: 'org:billing',
  },
  {
    id: 'members',
    label: 'Members and access',
    icon: Users,
    description: 'Who is in the organization and what they can reach.',
    capability: 'members:view',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    icon: SlidersHorizontal,
    description: 'Appearance and personal defaults.',
  },
]

export function SettingsShell({
  section,
  children,
}: {
  section: SettingsSection
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''

  return (
    <PageTransition>
      <PageBody>
        <PageHeader eyebrow="Settings" title={section.label} description={section.description} />

        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
            <ul className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col">
              {SETTINGS_SECTIONS.map((item) => {
                const href = `/app/settings/${item.id}`
                const active = pathname === href || (item.id === 'organization' && pathname === '/app/settings')
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] transition-colors',
                        active
                          ? 'bg-primary-soft font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="min-w-0 space-y-5">{children}</div>
        </div>
      </PageBody>
    </PageTransition>
  )
}
