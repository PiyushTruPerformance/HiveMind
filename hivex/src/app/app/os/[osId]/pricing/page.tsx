'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BillingToggle, PlanGrid } from '@/components/pricing/plan-grid'
import { FunnelShell } from '@/components/pricing/funnel-steps'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import {
  PLANS,
  TEAM_SIZE_OPTIONS,
  formatPlanPrice,
  recommendedPlanFor,
} from '@/platform/config/plans'
import type { BillingPeriod, OSId, PlanId, TeamSize } from '@/platform/types'

/**
 * Plan selection for one product.
 *
 * Reached only after the buyer has chosen a product, so the page can be
 * specific: it names the product, prices every tier for that product, and
 * recommends one. Every tier stays visible and switchable — the recommendation
 * is a hint, not a funnel.
 */
export default function OSPricingPage() {
  const params = useParams<{ osId: OSId }>()
  const router = useRouter()
  const access = useAccess()
  const { selectOS, choosePlan } = usePlatform()

  const os = OS_REGISTRY[params.osId]
  const subscription = access.subscriptionFor(os.id)
  const canBuy = access.canActivate()
  const isChange = subscription?.status === 'active'

  const [teamSize, setTeamSize] = useState<TeamSize | undefined>(subscription?.teamSize)
  const [period, setPeriod] = useState<BillingPeriod>(subscription?.billingPeriod ?? 'monthly')
  const recommended = recommendedPlanFor(os.id, teamSize)
  const [selected, setSelected] = useState<PlanId>(subscription?.planId ?? recommended)
  /* Touched tracks whether the buyer has made their own choice yet — until they
     do, answering the team-size question should move the selection with it. */
  const [touched, setTouched] = useState(Boolean(subscription))

  /* Landing here directly (a bookmark, a shared link) still counts as choosing
     the product — otherwise checkout would have nothing to check out. */
  useEffect(() => {
    if (!subscription) selectOS(os.id)
  }, [subscription, selectOS, os.id])

  useEffect(() => {
    if (!touched) setSelected(recommended)
  }, [recommended, touched])

  const plan = PLANS[selected]

  function proceed() {
    choosePlan(os.id, selected, period, teamSize)
    router.push(isChange ? `/app/os/${os.id}` : `/app/os/${os.id}/checkout`)
  }

  return (
    <FunnelShell
      osId={os.id}
      step="pricing"
      title={isChange ? `Change your ${os.shortName} plan` : `Choose your ${os.shortName} plan`}
      description={
        isChange
          ? 'Switching tier takes effect immediately. Your workspaces and connected data are untouched.'
          : `You picked ${os.name}. Plans are priced for this product — you can add others later, each on its own plan.`
      }
    >
      <div className="space-y-5">
        {/* One question, not a wizard. */}
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium">How large is the team using {os.shortName}?</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Only used to highlight a fit. Every plan stays available.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={teamSize === option.value}
                onClick={() => {
                  setTeamSize(teamSize === option.value ? undefined : option.value)
                  setTouched(false)
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-2xs font-medium transition-colors',
                  teamSize === option.value
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <BillingToggle osId={os.id} period={period} onChange={setPeriod} />
          <p className="text-2xs text-muted-foreground">
            No card is charged in this build — checkout is a demo.
          </p>
        </div>

        <PlanGrid
          osId={os.id}
          selected={selected}
          period={period}
          currentPlanId={isChange ? subscription?.planId : null}
          recommendedId={recommended}
          onSelect={(planId) => {
            setSelected(planId)
            setTouched(true)
          }}
        />

        <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/90 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <Badge tone="accent">{plan.name}</Badge>
            <span className="font-medium text-foreground">
              {formatPlanPrice(os.id, selected, period)}
            </span>
            <span>/{period === 'monthly' ? 'month' : 'year'}</span>
            {selected === recommended ? <Badge tone="neutral">Best fit for your team</Badge> : null}
          </div>
          <Tooltip content={canBuy ? undefined : 'Only an organization admin can buy a plan.'}>
            <span>
              <Button variant="primary" size="lg" onClick={proceed} disabled={!canBuy}>
                {isChange ? `Switch to ${plan.name}` : `Continue with ${plan.name}`}
                <ArrowRight className="size-4" />
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>
    </FunnelShell>
  )
}
