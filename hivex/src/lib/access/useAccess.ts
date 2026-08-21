'use client'

import { useMemo } from 'react'

import { OS_ORDER, OS_REGISTRY } from '@/platform/config/os-registry'
import { PLANS } from '@/platform/config/plans'
import { statusOf } from '@/platform/config/activation'
import type {
  OSActivationStatus,
  OSId,
  PlanCapabilities,
  PlanId,
  ScopedRole,
  Workspace,
} from '@/platform/types'
import { usePlatform } from '@/lib/state/platform-provider'

import {
  accountHasCapability,
  checkLimit,
  hasCapability as planHasCapability,
  planForOS,
  type Usage,
} from './entitlements'
import {
  accessibleOSIds,
  canActivateOS,
  evaluateOSAccess,
  evaluateWorkspaceAccess,
  hasCapability as roleHasCapability,
  meetsScopedRole,
  scopedRoleFor,
  visibleWorkspaces,
  type AccessSubject,
  type AccessVerdict,
  type Capability,
} from './permissions'

/**
 * The single hook every component uses to ask an access question.
 *
 * Three independent axes are combined here on purpose:
 *   - what the *member* is permitted to do          (permissions.ts)
 *   - what the *plan for that product* includes     (entitlements.ts)
 *   - how far that product got through activation   (config/activation.ts)
 *
 * Keeping them separate means a plan change, an RBAC change and a funnel change
 * never collide, and a blocked screen can say which of the three is the reason.
 */
export function useAccess() {
  const { member, subscriptions, workspaces, members } = usePlatform()

  return useMemo(() => {
    const subject: AccessSubject = { member, subscriptions }

    const usage: Usage = {
      workspacesPerOS: 0,
      members: members.filter((m) => m.status === 'approved').length,
      integrations: 0,
      aiMessagesPerMonth: 0,
    }

    const accessibleOS = accessibleOSIds(subject, OS_ORDER)

    return {
      member,
      role: member.role,
      subscriptions,
      isSuperadmin: member.role === 'superadmin',

      /** Platform capability check — role-driven. */
      can: (capability: Capability) => roleHasCapability(subject, capability),

      /** May this member buy or change a subscription? */
      canActivate: () => canActivateOS(subject),

      /* ---------------- per-product plan ---------------- */

      /** Tier held for a product, or null if the product was never added. */
      planFor: (osId: OSId): PlanId | null => planForOS(subscriptions, osId),
      planObjectFor: (osId: OSId) => {
        const planId = planForOS(subscriptions, osId)
        return planId ? PLANS[planId] : null
      },
      /** Capability of a specific product's tier. */
      planAllows: (osId: OSId, capability: keyof PlanCapabilities) => {
        const planId = planForOS(subscriptions, osId)
        return planId ? planHasCapability(planId, capability) : false
      },
      /** Capability granted by any held subscription — for cross-product features. */
      accountAllows: (capability: keyof PlanCapabilities) =>
        accountHasCapability(subscriptions, capability),

      /* ---------------- activation ---------------- */

      activationStatus: (osId: OSId): OSActivationStatus => statusOf(subscriptions[osId]),
      subscriptionFor: (osId: OSId) => subscriptions[osId],

      /* ---------------- access verdicts ---------------- */

      osAccess: (osId: OSId): AccessVerdict => evaluateOSAccess(subject, osId),
      canOpenOS: (osId: OSId) => evaluateOSAccess(subject, osId).allowed,

      workspaceAccess: (osId: OSId, workspaceId: string): AccessVerdict =>
        evaluateWorkspaceAccess(subject, osId, workspaceId),
      canOpenWorkspace: (osId: OSId, workspaceId: string) =>
        evaluateWorkspaceAccess(subject, osId, workspaceId).allowed,

      /** Workspaces the member may actually see inside an OS. */
      workspacesIn: (osId: OSId): Workspace[] =>
        visibleWorkspaces(subject, osId, workspaces[osId] ?? []),

      scopedRole: (osId: OSId): ScopedRole | null => scopedRoleFor(subject, osId),
      meetsRole: (osId: OSId, minRole: ScopedRole | undefined) =>
        meetsScopedRole(subject, osId, minRole),

      /** Nav items filtered by the member's scoped role inside an OS. */
      navigationFor: (osId: OSId) =>
        (OS_REGISTRY[osId]?.navigation ?? []).filter((item) =>
          meetsScopedRole(subject, osId, item.minRole),
        ),

      accessibleOS,

      /** Limit check against the tier held for a product. */
      limitFor: (osId: OSId, key: keyof Usage, used: number) => {
        const planId = planForOS(subscriptions, osId) ?? 'free'
        return checkLimit(planId, key, used)
      },
      usage,
    }
  }, [member, subscriptions, workspaces, members])
}

export type AccessApi = ReturnType<typeof useAccess>
