'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Clock, ShieldAlert } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageTransition } from '@/components/ui/page'
import { useAccess } from '@/lib/access/useAccess'
import { ACTIVATION_COPY, routeForStatus } from '@/platform/config/activation'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * Route-level gate for a product's *working* pages.
 *
 * Three outcomes, and only one of them is a dead end:
 *
 *   allowed        → render the product
 *   not_activated  → redirect into the purchase funnel at the exact stage the
 *                    organization stopped at, so nobody is told "no" when the
 *                    answer is "not yet, here is the next step"
 *   permission /
 *   unreleased     → explain, and offer the one action that helps
 *
 * The funnel routes themselves (about, pricing, checkout, setup) are not
 * wrapped by this guard — see the OS layout.
 */
export function OSGuard({ osId, children }: { osId: OSId; children: ReactNode }) {
  const access = useAccess()
  const router = useRouter()

  const verdict = access.osAccess(osId)
  const os = OS_REGISTRY[osId]
  const resumeAt = verdict.activationStatus

  /* Not activated is a stage, not a refusal — send them to finish it. */
  useEffect(() => {
    if (verdict.reason === 'not_activated' && resumeAt) {
      router.replace(routeForStatus(osId, resumeAt))
    }
  }, [verdict.reason, resumeAt, osId, router])

  if (verdict.allowed) return <>{children}</>

  if (verdict.reason === 'not_activated' && resumeAt) {
    const copy = ACTIVATION_COPY[resumeAt]
    return (
      <PageTransition>
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mx-auto w-fit">
            <OSTile os={os} size="xl" locked />
          </div>
          <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">{os.name}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{copy.hint}</p>
          <Button asChild variant="primary" className="mt-5">
            <Link href={routeForStatus(osId, resumeAt)}>
              {copy.cta}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto w-fit">
          <OSTile os={os} size="xl" locked />
        </div>

        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">{os.name}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{os.description}</p>

        <div className="mt-6 rounded-xl border bg-card p-5 text-left shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {verdict.reason === 'unreleased' ? (
                <Clock className="size-4" />
              ) : (
                <ShieldAlert className="size-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">
                {verdict.reason === 'unreleased' ? 'Not released yet' : 'You do not have access'}
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                {verdict.message}
              </p>

              {verdict.reason === 'unreleased' ? (
                <Badge tone="neutral" pending className="mt-3">
                  In design
                </Badge>
              ) : (
                <p className="mt-2 text-2xs text-muted-foreground">
                  An organization admin can grant it from Members and access.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/app">
              <ArrowLeft className="size-4" />
              Back to products
            </Link>
          </Button>
          {verdict.reason === 'permission' ? (
            <Button asChild variant="outline">
              <Link href="/app/settings/members">Request access</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/app/os/${osId}/about`}>Read about {os.shortName}</Link>
            </Button>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
