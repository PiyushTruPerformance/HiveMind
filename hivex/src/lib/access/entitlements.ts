import { PLANS, UNLIMITED, plansForOS } from '@/platform/config/plans'
import type { OSId, OSSubscription, Plan, PlanCapabilities, PlanId } from '@/platform/types'

/**
 * Plan entitlements — the single place a "is this allowed on this plan?"
 * question is answered.
 *
 * Entitlements are now **per product**: an organization holds one subscription
 * per OS, each on its own tier, so every limit and capability check needs to
 * know which product is asking. Components never compare plan ids; they ask for
 * a capability or a limit and this module resolves it from the subscription.
 */

export type LimitKey = keyof Plan['limits']

export interface Usage {
  workspacesPerOS: number
  members: number
  integrations: number
  aiMessagesPerMonth: number
}

export interface LimitVerdict {
  allowed: boolean
  limit: number
  used: number
  remaining: number
  unlimited: boolean
  /** 0-1, clamped. Undefined when unlimited. */
  ratio?: number
}

export type Subscriptions = Partial<Record<OSId, OSSubscription>>

export function planOf(planId: PlanId): Plan {
  return PLANS[planId]
}

/** The tier an organization holds for a product, or null if it holds none. */
export function planForOS(subscriptions: Subscriptions, osId: OSId): PlanId | null {
  return subscriptions[osId]?.planId ?? null
}

export function hasCapability(planId: PlanId, capability: keyof PlanCapabilities): boolean {
  return PLANS[planId].capabilities[capability]
}

/**
 * Capability across the whole account.
 *
 * A cross-product capability is granted if *any* held subscription grants it —
 * paying for Gold on one product should not be undone by holding Free on
 * another.
 */
export function accountHasCapability(
  subscriptions: Subscriptions,
  capability: keyof PlanCapabilities,
): boolean {
  return Object.values(subscriptions).some(
    (subscription) => subscription && hasCapability(subscription.planId, capability),
  )
}

export function limitOf(planId: PlanId, key: LimitKey): number {
  return PLANS[planId].limits[key]
}

export function checkLimit(planId: PlanId, key: keyof Usage, used: number): LimitVerdict {
  const limit = PLANS[planId].limits[key]
  const unlimited = limit === UNLIMITED
  return {
    allowed: unlimited || used < limit,
    limit,
    used,
    remaining: unlimited ? Number.POSITIVE_INFINITY : Math.max(limit - used, 0),
    unlimited,
    ratio: unlimited ? undefined : Math.min(used / Math.max(limit, 1), 1),
  }
}

/** Cheapest tier of a product that grants a capability — drives upgrade prompts. */
export function upgradeTargetFor(osId: OSId, capability: keyof PlanCapabilities): PlanId | null {
  return plansForOS(osId).find((id) => PLANS[id].capabilities[capability]) ?? null
}
