import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'

import { BrandLockup } from '@/components/common/brand-mark'
import { DemoEntry } from '@/components/common/demo-entry'
import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BRAND, PLATFORM_PILLARS } from '@/platform/config/brand'
import { OS_LIST } from '@/platform/config/os-registry'
import { PLANS, PLAN_LIST, formatPrice, plansForOS, priceFor } from '@/platform/config/plans'
import { isClerkEnabled } from '@/lib/auth/authMode'

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] grid-fade" aria-hidden />

      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <BrandLockup />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        {/* Hero */}
        <section className="pt-14 sm:pt-20">
          <Badge tone="neutral" dot className="mb-5">
            One account · One organization · Every product
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[3.25rem]">
            The operating system
            <br />
            for your organization.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {BRAND.description} Reporting, SEO and HR run as separate products with their own
            workspaces and data — and one assistant that understands all of them.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DemoEntry />
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-up">
                Start from scratch
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-2xs text-muted-foreground">
            {isClerkEnabled
              ? 'Authentication is handled by Clerk.'
              : 'Running in demo identity mode — add Clerk keys to switch on real authentication.'}
          </p>
        </section>

        {/* Products */}
        <section className="mt-20">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            The products
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OS_LIST.map((os) => (
              <div
                key={os.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <OSTile os={os} size="lg" />
                  {os.status === 'coming_soon' ? (
                    <Badge tone="neutral" pending>
                      Coming soon
                    </Badge>
                  ) : null}
                </div>
                <div>
                  <p className="font-display text-[15px] font-semibold">{os.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {os.tagline}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pillars */}
        <section className="mt-20 grid gap-6 border-t pt-12 sm:grid-cols-3">
          {PLATFORM_PILLARS.map((pillar) => (
            <div key={pillar.title}>
              <h3 className="font-display text-[15px] font-semibold">{pillar.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{pillar.body}</p>
            </div>
          ))}
        </section>

        {/* Assistant */}
        <section className="mt-20 overflow-hidden rounded-xl border bg-card p-8 shadow-sm">
          <div className="ambient" aria-hidden />
          <div className="relative max-w-2xl">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles className="size-4" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Ask Tru — one assistant, every product, your permissions.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Ask Tru from the home screen and it reasons across every product you can access.
              Ask it inside a product and it narrows to that product&apos;s data. Either way it
              tells you when something was left out because you are not allowed to see it.
            </p>
          </div>
        </section>

        {/* Pricing — per product, which is how it is actually sold. */}
        <section className="mt-20">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pricing
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Each product is bought and priced on its own — four tiers per product, from a free
            plan upward. Add one, or several, each on whichever tier suits it.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OS_LIST.filter((os) => os.status !== 'coming_soon').map((os) => {
              const tiers = plansForOS(os.id)
              return (
                <div key={os.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <OSTile os={os} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-semibold">{os.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">{os.tagline}</p>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-1.5 border-t pt-4">
                    {tiers.map((planId) => (
                      <li
                        key={planId}
                        className="flex items-baseline justify-between gap-2 text-2xs"
                      >
                        <span className="text-muted-foreground">{PLANS[planId].name}</span>
                        <span className="font-medium tabular-nums">
                          {formatPrice(priceFor(os.id, planId, 'monthly'))}
                          {priceFor(os.id, planId, 'monthly') > 0 ? (
                            <span className="font-normal text-muted-foreground"> /mo</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_LIST.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col rounded-xl border border-dashed bg-surface-sunken/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-[13px] font-semibold">{plan.name}</p>
                  {plan.recommended ? <Badge tone="accent">Popular</Badge> : null}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {plan.highlights.slice(0, 4).map((line) => (
                    <li key={line} className="flex gap-2 text-2xs text-muted-foreground">
                      <Check className="mt-0.5 size-3 shrink-0 text-success" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

      </main>

      <footer className="relative border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-2xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {BRAND.name} — frontend foundation. Data on every screen is demo data from the mock
            service layer.
          </span>
          <span>{BRAND.supportEmail}</span>
        </div>
      </footer>
    </div>
  )
}
