'use client'

import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { Button } from '@/components/ui/button'
import { PageTransition } from '@/components/ui/page'
import { cn } from '@/lib/utils/cn'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * Shared chrome for the three purchase steps.
 *
 * Pricing, checkout and setup are one continuous journey, so they share a
 * header, a progress rail and a back affordance rather than each inventing
 * their own — the same reasoning the old onboarding wizard used, applied to the
 * per-product funnel that replaced it.
 */

export type FunnelStep = 'pricing' | 'checkout' | 'setup'

const STEPS: { id: FunnelStep; label: string }[] = [
  { id: 'pricing', label: 'Plan' },
  { id: 'checkout', label: 'Payment' },
  { id: 'setup', label: 'Connect data' },
]

export function FunnelShell({
  osId,
  step,
  title,
  description,
  children,
}: {
  osId: OSId
  step: FunnelStep
  title: string
  description: ReactNode
  children: ReactNode
}) {
  const os = OS_REGISTRY[osId]
  const activeIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/app/os/${osId}/about`}>
            <ArrowLeft className="size-4" />
            Back to {os.shortName}
          </Link>
        </Button>

        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <OSTile os={os} size="lg" />
            <div className="min-w-0">
              <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                {os.name}
              </p>
              <h1 className="font-display text-xl font-semibold tracking-tight sm:text-[22px]">
                {title}
              </h1>
            </div>
          </div>
          {description ? (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}

          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Setup steps">
            {STEPS.map((item, index) => {
              const done = index < activeIndex
              const active = index === activeIndex
              return (
                <li key={item.id} className="flex flex-1 items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                      done
                        ? 'border-success bg-success text-success-foreground'
                        : active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border-strong text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span
                    className={cn('text-2xs', active ? 'font-medium' : 'text-muted-foreground')}
                  >
                    {item.label}
                  </span>
                  {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
                </li>
              )
            })}
          </ol>
        </header>

        {children}
      </div>
    </PageTransition>
  )
}
