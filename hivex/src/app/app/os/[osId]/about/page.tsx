'use client'

import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Clock, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'

import { OSTile } from '@/components/common/os-tile'
import { IntegrationIcon } from '@/components/integrations/integration-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageTransition, SectionHeading } from '@/components/ui/page'
import { Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { ACTIVATION_COPY, routeForStatus } from '@/platform/config/activation'
import { getIntegration } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { formatPrice, plansForOS, priceFor } from '@/platform/config/plans'
import type { OSId } from '@/platform/types'

/**
 * Product detail — the page that has to earn the purchase.
 *
 * Entirely driven by the registry entry's `marketing` block, so a new product
 * ships its own detail page by writing config rather than a new route. Nothing
 * here is product-specific code.
 */
export default function OSAboutPage() {
  const params = useParams<{ osId: OSId }>()
  const router = useRouter()
  const access = useAccess()
  const { selectOS } = usePlatform()

  const os = OS_REGISTRY[params.osId]
  const status = access.activationStatus(os.id)
  const marketing = os.marketing
  const unreleased = os.status === 'coming_soon'
  const canBuy = access.canActivate()

  const cheapest = plansForOS(os.id)[0]
  const fromPrice = cheapest ? priceFor(os.id, cheapest, 'monthly') : 0

  const integrations = [...os.requiredIntegrations, ...os.optionalIntegrations]
    .map((id) => getIntegration(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))

  function start() {
    selectOS(os.id)
    router.push(`/app/os/${os.id}/pricing`)
  }

  const primaryCta =
    status === 'active' ? (
      <Button asChild variant="primary" size="lg">
        <Link href={`/app/os/${os.id}`}>
          Open {os.shortName}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    ) : unreleased ? (
      <Button variant="primary" size="lg" disabled>
        <Clock className="size-4" />
        Coming soon
      </Button>
    ) : status !== 'discoverable' ? (
      <Button asChild variant="primary" size="lg">
        <Link href={routeForStatus(os.id, status)}>
          {ACTIVATION_COPY[status].cta}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    ) : (
      <Tooltip content={canBuy ? undefined : 'Only an organization admin can add a product.'}>
        <span>
          <Button variant="primary" size="lg" onClick={start} disabled={!canBuy}>
            Choose {os.shortName}
            <ArrowRight className="size-4" />
          </Button>
        </span>
      </Tooltip>
    )

  return (
    <PageTransition>
      <div className="space-y-10">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/app">
            <ArrowLeft className="size-4" />
            All products
          </Link>
        </Button>

        {/* Hero */}
        <section className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="ambient" aria-hidden />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <OSTile os={os} size="xl" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold tracking-tight">{os.name}</h1>
                  {status === 'active' ? (
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  ) : unreleased ? (
                    <Badge tone="neutral" pending>
                      Coming soon
                    </Badge>
                  ) : status !== 'discoverable' ? (
                    <Badge tone="warning" dot>
                      {ACTIVATION_COPY[status].label}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{os.tagline}</p>
              </div>
            </div>

            <h2 className="mt-6 max-w-2xl font-display text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {marketing.headline}
            </h2>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              {marketing.subheadline}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {primaryCta}
              {!unreleased && status === 'discoverable' ? (
                <span className="text-2xs text-muted-foreground">
                  From{' '}
                  <span className="font-medium text-foreground">{formatPrice(fromPrice)}</span>
                  {fromPrice > 0 ? ' / month' : ''} · cancel any time
                </span>
              ) : null}
            </div>
          </div>
        </section>

        {/* Outcomes */}
        {marketing.outcomes.length > 0 ? (
          <section className="grid gap-4 sm:grid-cols-3">
            {marketing.outcomes.map((outcome) => (
              <div key={outcome.label} className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="font-display text-2xl font-semibold tabular-nums tracking-tight">
                  {outcome.value}
                </p>
                <p className="mt-1 text-[13px] font-medium">{outcome.label}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">{outcome.caption}</p>
              </div>
            ))}
          </section>
        ) : null}

        {/* Problems + audience */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>What it solves</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {marketing.problems.map((problem) => (
                  <li key={problem} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive"
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{problem}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who it is for</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {marketing.audience.map((who) => (
                  <li key={who} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                    <span className="text-muted-foreground">{who}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Capabilities */}
        <section className="space-y-3">
          <SectionHeading
            title="What you can do"
            description={`Everything ${os.name} ships with today.`}
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {marketing.capabilities.map((capability, index) => (
              <motion.div
                key={capability.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.18 }}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <span
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `hsl(${os.hue} / 0.13)`,
                    color: `hsl(${os.hue})`,
                  }}
                >
                  <capability.icon className="size-4" aria-hidden />
                </span>
                <p className="mt-3 font-display text-[14px] font-semibold">{capability.title}</p>
                <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                  {capability.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Workflows */}
        <section className="space-y-3">
          <SectionHeading
            title="How teams use it"
            description="The paths most organizations run on day one."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {marketing.workflows.map((workflow) => (
              <div key={workflow.title} className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="font-display text-[14px] font-semibold">{workflow.title}</p>
                <ol className="mt-3 space-y-2">
                  {workflow.steps.map((step, i) => (
                    <li key={step} className="flex gap-2.5 text-2xs leading-relaxed">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* Integrations */}
        {integrations.length > 0 ? (
          <section className="space-y-3">
            <SectionHeading
              title="Integrations"
              description="Connected once for the whole organization, used by whichever product needs them."
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {integrations.map((integration) => {
                const required = os.requiredIntegrations.includes(integration.id)
                return (
                  <div
                    key={integration.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border bg-card p-3 shadow-xs',
                      required && 'border-primary/30',
                    )}
                  >
                    <IntegrationIcon integration={integration} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{integration.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {integration.description}
                      </p>
                    </div>
                    {required ? (
                      <Badge tone="accent" className="shrink-0">
                        Required
                      </Badge>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* Ask Tru */}
        <section className="overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
          <div className="ambient" aria-hidden />
          <div className="relative max-w-2xl">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles className="size-4" />
            </span>
            <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">
              Ask Tru knows {os.shortName}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Ask questions in plain language and get answers from{' '}
              {os.assistant.dataSources.join(', ')} — scoped to what your role is allowed to see.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {os.assistant.suggestions.slice(0, 3).map((prompt) => (
                <span
                  key={prompt}
                  className="rounded-full border bg-surface px-3 py-1.5 text-2xs text-muted-foreground"
                >
                  {prompt}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-surface-sunken/60 px-6 py-10 text-center">
          <h3 className="font-display text-lg font-semibold tracking-tight">
            {status === 'active'
              ? `${os.name} is active on your organization.`
              : unreleased
                ? `${os.name} is not available yet.`
                : `Ready to get started with ${os.name}?`}
          </h3>
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {status === 'active'
              ? 'Jump straight into your workspaces.'
              : unreleased
                ? 'It is registered on the platform and will appear here when it ships.'
                : 'Pick a plan next. You can compare all of them and change your mind before paying.'}
          </p>
          <div className="mt-1">{primaryCta}</div>
        </section>
      </div>
    </PageTransition>
  )
}
