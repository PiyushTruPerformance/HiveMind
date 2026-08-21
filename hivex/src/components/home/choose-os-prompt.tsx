'use client'

import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'
import { motion } from 'motion/react'

import { OSTile } from '@/components/common/os-tile'
import { Button } from '@/components/ui/button'
import { useAccess } from '@/lib/access/useAccess'
import { OS_LIST } from '@/platform/config/os-registry'
import { formatPrice, plansForOS, priceFor } from '@/platform/config/plans'

/**
 * The first thing a new organization sees.
 *
 * Shown only while nothing is active: once a product is running, this banner
 * would be noise above the launcher. It sits at the very top of the home page
 * because choosing a product is the one decision that unblocks everything else.
 */
export function ChooseOSPrompt() {
  const access = useAccess()

  const anyActive = OS_LIST.some((os) => access.activationStatus(os.id) === 'active')
  if (anyActive) return null

  const available = OS_LIST.filter((os) => os.status !== 'coming_soon')
  const inProgress = available.find((os) => access.activationStatus(os.id) !== 'discoverable')

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="ambient" aria-hidden />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Compass className="size-4" />
          </span>
          <h2 className="mt-3 font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {inProgress
              ? `Finish setting up ${inProgress.name}`
              : 'Choose the OS that fits your workflow'}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {inProgress
              ? 'You started adding a product but have not finished. Pick up where you left off, or explore the others first.'
              : 'Each product is a full application with its own workspaces, data and pricing. Explore one to see what it does before you commit — you can add more later.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild variant="primary" size="lg">
              <Link href={`/app/os/${(inProgress ?? available[0]).id}/about`}>
                {inProgress ? `Continue with ${inProgress.shortName}` : 'Explore products'}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <span className="text-2xs text-muted-foreground">
              Free tiers available · no card needed to explore
            </span>
          </div>
        </div>

        {/* Compact product strip — a second, lower-friction way in. */}
        <ul className="flex shrink-0 flex-col gap-2 lg:w-72">
          {available.map((os) => {
            const cheapest = plansForOS(os.id)[0]
            const from = cheapest ? priceFor(os.id, cheapest, 'monthly') : 0
            return (
              <li key={os.id}>
                <Link
                  href={`/app/os/${os.id}/about`}
                  className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-muted"
                >
                  <OSTile os={os} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{os.name}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {os.tagline}
                    </span>
                  </span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {formatPrice(from)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </motion.section>
  )
}
