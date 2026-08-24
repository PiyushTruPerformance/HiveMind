'use client'

import Link from 'next/link'
import { ArrowRight, Blocks, Building2, TriangleAlert, Users } from 'lucide-react'

import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import { ActivityFeed } from '@/components/home/activity-feed'
import { ChooseOSPrompt } from '@/components/home/choose-os-prompt'
import { OSLauncher } from '@/components/home/os-launcher'
import { RecentWorkspaces } from '@/components/home/recent-workspaces'
import { StatusPill, isUnhealthy } from '@/components/integrations/status-pill'
import { IntegrationIcon } from '@/components/integrations/integration-icon'
import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageBody, PageHeader, PageTransition, SectionHeading } from '@/components/ui/page'
import { useAccess } from '@/lib/access/useAccess'
import { useIdentity } from '@/lib/state/identity-provider'
import { usePlatform } from '@/lib/state/platform-provider'
import { providerIconIntegration } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { PLANS, formatLimit, priceFor } from '@/platform/config/plans'

/**
 * Platform home — now the product-discovery hub as well as the launcher.
 *
 * Order is deliberate: choose a product (if nothing is running yet), then Ask
 * Tru, then the products themselves. Subscription and usage detail sits below
 * the fold, because it only matters once something is actually running.
 */
export default function PlatformHome() {
  const identity = useIdentity()
  const { organization, accounts, members, subscriptions } = usePlatform()
  const access = useAccess()

  /* Attention is per *account* — one broken Google login, not one broken GA4. */
  const needsAttention = accounts.filter((a) => isUnhealthy(a.status))
  const approvedMembers = members.filter((m) => m.status === 'approved').length
  const waitingMembers = members.filter((m) => m.status === 'waiting').length
  const connectedCount = accounts.filter((a) => a.status === 'connected').length

  const held = Object.values(subscriptions).filter(Boolean)
  const activeSubs = held.filter((s) => s!.status === 'active')
  const monthlyTotal = activeSubs.reduce(
    (total, s) => total + priceFor(s!.osId, s!.planId, s!.billingPeriod),
    0,
  )

  const firstName = identity.user.name.split(' ')[0]

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              <Building2 className="size-3" />
              {organization?.name}
              {activeSubs.length > 0 ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <Badge tone="neutral">
                    {activeSubs.length} active {activeSubs.length === 1 ? 'product' : 'products'}
                  </Badge>
                </>
              ) : null}
            </span>
          }
          title={`Good to see you, ${firstName}`}
          description="Everything your organization runs on, in one place."
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/integrations">
                  <Blocks className="size-4" />
                  Integrations
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/settings/members">
                  <Users className="size-4" />
                  Invite team
                </Link>
              </Button>
            </>
          }
        />

        <ChooseOSPrompt />

        <AssistantLauncher title="Ask Tru about your organization" />

        {needsAttention.length > 0 ? (
          <Card tone="panel" className="border-warning/40 bg-warning-soft/40">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <div>
                  <p className="text-[13px] font-medium">
                    {needsAttention.length} connection
                    {needsAttention.length === 1 ? '' : 's'} need attention
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {needsAttention.map((account) => (
                      <span
                        key={account.id}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-2 py-1 text-2xs"
                      >
                        <IntegrationIcon
                          integration={providerIconIntegration(account.provider)}
                          size="sm"
                          className="!size-4 !text-[8px]"
                        />
                        {account.label}
                        <StatusPill status={account.status} />
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/app/integrations?filter=attention">
                  Review
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-3">
          <SectionHeading
            title="Your products"
            description="Each product is a full application with its own workspaces, data and plan."
          />
          <OSLauncher />
        </section>

        {activeSubs.length > 0 ? (
          <section className="space-y-3">
            <SectionHeading
              title="Jump back in"
              description="Workspaces you opened most recently, across every product."
            />
            <RecentWorkspaces />
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Across your organization</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Subscriptions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeSubs.length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    No products added yet. Explore one above — each is priced on its own, so you
                    only pay for what you use.
                  </p>
                ) : (
                  <>
                    {activeSubs.map((subscription) => {
                      const os = OS_REGISTRY[subscription!.osId]
                      const plan = PLANS[subscription!.planId]
                      return (
                        <Link
                          key={subscription!.osId}
                          href={`/app/os/${subscription!.osId}/pricing`}
                          className="flex items-center gap-2.5 rounded-md p-1 -m-1 transition-colors hover:bg-muted/60"
                        >
                          <OSTile os={os} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px]">{os.shortName}</span>
                            <span className="block text-2xs text-muted-foreground">
                              {plan.name} · {subscription!.billingPeriod}
                            </span>
                          </span>
                          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                            ${priceFor(subscription!.osId, subscription!.planId, subscription!.billingPeriod)}
                          </span>
                        </Link>
                      )
                    })}
                    <div className="flex items-baseline justify-between border-t pt-2.5">
                      <span className="text-2xs text-muted-foreground">Current total</span>
                      <span className="font-display text-base font-semibold tabular-nums">
                        ${monthlyTotal.toLocaleString('en-US')}
                      </span>
                    </div>
                  </>
                )}
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/app/settings/plan">Manage subscriptions</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Organization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Row label="Members" value={String(approvedMembers)} href="/app/settings/members" />
                <Row
                  label="Connected tools"
                  value={String(connectedCount)}
                  href="/app/integrations"
                />
                <Row
                  label="Products available"
                  value={formatLimit(
                    Object.keys(OS_REGISTRY).filter(
                      (id) => OS_REGISTRY[id as keyof typeof OS_REGISTRY].status !== 'coming_soon',
                    ).length,
                  )}
                />
              </CardContent>
            </Card>

            {waitingMembers > 0 && access.can('members:approve') ? (
              <Card>
                <CardHeader>
                  <CardTitle>Waiting for approval</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] text-muted-foreground">
                    {waitingMembers} {waitingMembers === 1 ? 'person has' : 'people have'} requested
                    to join {organization?.name} by matching the email domain.
                  </p>
                  <Button asChild variant="primary" size="sm" className="mt-3">
                    <Link href="/app/admin/members">Review requests</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </PageBody>
    </PageTransition>
  )
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[13px]">{label}</span>
      <span className="text-[13px] font-medium tabular-nums">{value}</span>
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-md p-1 -m-1 transition-colors hover:bg-muted/60">
      {body}
    </Link>
  ) : (
    body
  )
}
