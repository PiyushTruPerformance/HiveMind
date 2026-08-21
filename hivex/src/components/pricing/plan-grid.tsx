'use client'

import { Check, Minus, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import {
  PLANS,
  formatLimit,
  formatPlanPrice,
  offerFor,
  plansForOS,
  yearlySavingPercent,
} from '@/platform/config/plans'
import type { BillingPeriod, OSId, PlanId } from '@/platform/types'

/**
 * Plan comparison — the one pricing card in the codebase.
 *
 * Used by the purchase funnel and by Settings when changing an existing
 * subscription. Every number comes from src/platform/config/plans.ts, and the
 * product-specific bullets come from OS_PRICING, so a price change is a config
 * edit and never a component edit.
 */

export function BillingToggle({
  osId,
  period,
  onChange,
}: {
  osId: OSId
  period: BillingPeriod
  onChange: (period: BillingPeriod) => void
}) {
  // Quote the saving from the recommended tier — it is the one most people read.
  const reference = plansForOS(osId).find((id) => PLANS[id].recommended) ?? plansForOS(osId)[0]
  const saving = reference ? yearlySavingPercent(osId, reference) : 0

  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
      {(['monthly', 'yearly'] as BillingPeriod[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={period === option}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-medium capitalize transition-colors',
            period === option
              ? 'bg-surface text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option}
          {option === 'yearly' && saving > 0 ? (
            <Badge tone="success" className="px-1.5">
              −{saving}%
            </Badge>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function PlanGrid({
  osId,
  selected,
  period,
  currentPlanId,
  recommendedId,
  onSelect,
}: {
  osId: OSId
  selected: PlanId
  period: BillingPeriod
  /** Tier already held, if this is a change rather than a purchase. */
  currentPlanId?: PlanId | null
  /** Tier to badge as the fit for what the buyer told us. */
  recommendedId?: PlanId
  onSelect: (planId: PlanId) => void
}) {
  const available = plansForOS(osId)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {available.map((planId, index) => (
        <motion.div
          key={planId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.04, duration: 0.2 }}
        >
          <PlanCard
            osId={osId}
            planId={planId}
            period={period}
            selected={selected === planId}
            isCurrent={currentPlanId === planId}
            isRecommended={recommendedId === planId}
            onSelect={() => onSelect(planId)}
          />
        </motion.div>
      ))}
    </div>
  )
}

function PlanCard({
  osId,
  planId,
  period,
  selected,
  isCurrent,
  isRecommended,
  onSelect,
}: {
  osId: OSId
  planId: PlanId
  period: BillingPeriod
  selected: boolean
  isCurrent?: boolean
  isRecommended?: boolean
  onSelect: () => void
}) {
  const plan = PLANS[planId]
  const offer = offerFor(osId, planId)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${plan.name} plan, ${formatPlanPrice(osId, planId, period)}`}
      className={cn(
        'flex h-full w-full flex-col rounded-xl border bg-card p-5 text-left shadow-sm transition-all',
        'hover:border-border-strong hover:shadow-md',
        selected && 'border-primary shadow-md ring-1 ring-primary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold">{plan.name}</p>
          <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">{plan.tagline}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {isRecommended ? <Badge tone="accent">Best fit</Badge> : null}
          {isCurrent ? <Badge tone="neutral">Current</Badge> : null}
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-3xl font-semibold tabular-nums tracking-tight">
          {formatPlanPrice(osId, planId, period)}
        </span>
        {offer.price[period] > 0 ? (
          <span className="text-2xs text-muted-foreground">
            /{period === 'monthly' ? 'mo' : 'yr'}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">
        {formatLimit(plan.limits.seatsIncluded, 'seats')} included
      </p>

      {offer.highlights.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t pt-4">
          {offer.highlights.map((line) => (
            <li key={line} className="flex gap-2 text-2xs leading-relaxed">
              <Check className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-4 flex-1 space-y-1.5 border-t pt-4">
        {plan.highlights.map((line) => (
          <li key={line} className="flex gap-2 text-2xs leading-relaxed text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0 text-success" aria-hidden />
            {line}
          </li>
        ))}
        {plan.capabilities.crossOSAssistant ? (
          <li className="flex gap-2 text-2xs leading-relaxed text-muted-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden />
            Ask Tru across every product you own
          </li>
        ) : (
          <li className="flex gap-2 text-2xs leading-relaxed text-muted-foreground/70">
            <Minus className="mt-0.5 size-3 shrink-0" aria-hidden />
            Ask Tru is limited to this product
          </li>
        )}
      </ul>

      <span
        className={cn(
          'mt-5 inline-flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium transition-colors',
          selected
            ? 'bg-primary text-primary-foreground'
            : 'border border-border-strong bg-surface text-foreground',
        )}
      >
        {selected ? 'Selected' : isCurrent ? 'Keep current plan' : `Choose ${plan.name}`}
      </span>
    </button>
  )
}
