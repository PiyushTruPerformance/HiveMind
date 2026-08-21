import {
  DEFAULT_SCOPED_ROLE_FOR_ORG_ROLE,
  ORG_ROLE_RANK,
  SCOPED_ROLE_RANK,
} from '@/platform/config/roles'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type {
  OrgMember,
  OrgRole,
  OSActivationStatus,
  OSId,
  OSSubscription,
  ScopedRole,
  Workspace,
} from '@/platform/types'
import { statusOf } from '@/platform/config/activation'
import type { Subscriptions } from './entitlements'

/**
 * Central authorization abstraction.
 *
 * This file is the whole point of the RBAC-readiness requirement: every access
 * question in the application funnels through `evaluate*` here. Components never
 * compare roles inline. When the real RBAC service lands it replaces the bodies
 * of these functions — the call sites, the route guards and the UI states stay
 * exactly as they are.
 *
 * Frontend permission checks are UX, not security. The backend (Clerk JWT +
 * FastAPI dependencies + MCP tenant resolution) remains the enforcement point.
 */

export type Capability =
  | 'org:manage'
  | 'org:billing'
  | 'members:view'
  | 'members:invite'
  | 'members:approve'
  | 'members:remove'
  | 'workspace:create'
  | 'workspace:delete'
  | 'workspace:edit'
  | 'integration:view'
  | 'integration:connect'
  | 'integration:disconnect'
  | 'data:sync'
  | 'assistant:use'
  | 'admin:console'
  | 'superadmin:console'

/** Minimum organization role required for each platform capability. */
const CAPABILITY_MIN_ORG_ROLE: Record<Capability, OrgRole> = {
  'org:manage': 'admin',
  'org:billing': 'admin',
  'members:view': 'team_member',
  'members:invite': 'team_lead',
  'members:approve': 'vp',
  'members:remove': 'vp',
  'workspace:create': 'team_lead',
  'workspace:delete': 'vp',
  'workspace:edit': 'team_lead',
  'integration:view': 'team_member',
  'integration:connect': 'team_lead',
  'integration:disconnect': 'admin',
  'data:sync': 'team_member',
  'assistant:use': 'client',
  'admin:console': 'team_member',
  'superadmin:console': 'superadmin',
}

export interface AccessSubject {
  member: OrgMember
  /** One subscription per product; absent means the product was never added. */
  subscriptions: Subscriptions
}

export function hasCapability(subject: AccessSubject, capability: Capability): boolean {
  if (subject.member.status !== 'approved') return false
  const required = CAPABILITY_MIN_ORG_ROLE[capability]
  return ORG_ROLE_RANK[subject.member.role] >= ORG_ROLE_RANK[required]
}

/* -------------------------------------------------------------------------- */
/* OS access                                                                   */
/* -------------------------------------------------------------------------- */

export type DenyReason =
  | 'permission'
  | 'unreleased'
  | 'not_approved'
  /** The product exists and is permitted, but the org has not finished adding it. */
  | 'not_activated'

export interface AccessVerdict {
  allowed: boolean
  reason?: DenyReason
  /** Copy the UI shows when access is denied. */
  message?: string
  /** Set when `reason` is `not_activated`: where the funnel should resume. */
  activationStatus?: OSActivationStatus
}

const ALLOWED: AccessVerdict = { allowed: true }

export function evaluateOSAccess(subject: AccessSubject, osId: OSId): AccessVerdict {
  const os = OS_REGISTRY[osId]
  if (!os) return { allowed: false, reason: 'permission', message: 'Unknown product.' }

  if (subject.member.status !== 'approved') {
    return {
      allowed: false,
      reason: 'not_approved',
      message: 'Your membership is still awaiting approval.',
    }
  }

  if (os.status === 'coming_soon') {
    return {
      allowed: false,
      reason: 'unreleased',
      message: `${os.name} has not been released yet.`,
    }
  }

  const activation = statusOf(subject.subscriptions[osId])
  if (activation !== 'active') {
    return {
      allowed: false,
      reason: 'not_activated',
      activationStatus: activation,
      message:
        activation === 'discoverable'
          ? `${os.name} has not been added to your organization yet.`
          : `Setting up ${os.name} is not finished yet.`,
    }
  }

  // Superadmins and org admins see every activated product.
  if (ORG_ROLE_RANK[subject.member.role] >= ORG_ROLE_RANK.vp) return ALLOWED

  // An empty osAccess list means "inherit the role default" rather than "none",
  // so a fresh member is not locked out of everything by an unset field.
  if (subject.member.osAccess.length === 0) return ALLOWED

  if (!subject.member.osAccess.includes(osId)) {
    return {
      allowed: false,
      reason: 'permission',
      message: `You have not been granted access to ${os.name}.`,
    }
  }

  return ALLOWED
}

/** Scoped role the subject holds inside an OS. Null means no access at all. */
export function scopedRoleFor(subject: AccessSubject, osId: OSId): ScopedRole | null {
  const explicit = subject.member.osRoles[osId]
  if (explicit) return explicit
  return DEFAULT_SCOPED_ROLE_FOR_ORG_ROLE[subject.member.role]
}

export function meetsScopedRole(
  subject: AccessSubject,
  osId: OSId,
  minRole: ScopedRole | undefined,
): boolean {
  if (!minRole) return true
  const role = scopedRoleFor(subject, osId)
  if (!role) return false
  return SCOPED_ROLE_RANK[role] >= SCOPED_ROLE_RANK[minRole]
}

/* -------------------------------------------------------------------------- */
/* Workspace access                                                            */
/* -------------------------------------------------------------------------- */

export function evaluateWorkspaceAccess(
  subject: AccessSubject,
  osId: OSId,
  workspaceId: string,
): AccessVerdict {
  const osVerdict = evaluateOSAccess(subject, osId)
  if (!osVerdict.allowed) return osVerdict

  if (ORG_ROLE_RANK[subject.member.role] >= ORG_ROLE_RANK.vp) return ALLOWED

  const granted = subject.member.workspaceAccess[osId]
  // Unset means "not yet scoped" — inherit OS access rather than deny.
  if (!granted || granted.length === 0) return ALLOWED

  if (!granted.includes(workspaceId)) {
    return {
      allowed: false,
      reason: 'permission',
      message: 'This workspace has not been shared with you.',
    }
  }
  return ALLOWED
}

export function visibleWorkspaces(
  subject: AccessSubject,
  osId: OSId,
  workspaces: Workspace[],
): Workspace[] {
  return workspaces.filter((w) => evaluateWorkspaceAccess(subject, osId, w.id).allowed)
}

/** Every OS the subject can actually open right now. */
export function accessibleOSIds(subject: AccessSubject, all: OSId[]): OSId[] {
  return all.filter((osId) => evaluateOSAccess(subject, osId).allowed)
}

/**
 * Whether the subject may move a product *through* the funnel.
 *
 * Buying is an organization-level act, so it is gated on billing rights rather
 * than on the product's own scoped roles — a team member can explore a product
 * but cannot put it on the company card.
 */
export function canActivateOS(subject: AccessSubject): boolean {
  return hasCapability(subject, 'org:billing')
}

export function subscriptionFor(
  subject: AccessSubject,
  osId: OSId,
): OSSubscription | undefined {
  return subject.subscriptions[osId]
}
