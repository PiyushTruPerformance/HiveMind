import type { OrgRole, ScopedRole } from '@/platform/types'

/**
 * Role catalog.
 *
 * Organization roles are carried over verbatim from the Reporting OS
 * (SYSTEM_ARCHITECTURE section 4.2, client/lib/Types/roles.ts) so that when the
 * real RBAC backend lands, the strings already match. `superadmin` is new: it
 * is the platform-operator role that spans organizations.
 */
export const ORG_ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  VP: 'vp',
  TEAM_LEAD: 'team_lead',
  TEAM_MEMBER: 'team_member',
  CLIENT: 'client',
  USER: 'user',
} as const satisfies Record<string, OrgRole>

export const SCOPED_ROLES = {
  ADMIN: 'admin',
  TEAM_LEAD: 'team_lead',
  EDITOR: 'editor',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
} as const satisfies Record<string, ScopedRole>

interface RoleMeta {
  label: string
  description: string
}

export const ORG_ROLE_META: Record<OrgRole, RoleMeta> = {
  superadmin: {
    label: 'Superadmin',
    description: 'Platform operator. Spans every organization, workspace and OS.',
  },
  admin: {
    label: 'Organization admin',
    description: 'Full control of the organization, its plan, members and every OS.',
  },
  vp: {
    label: 'VP',
    description: 'Approves members and manages every workspace, but not billing.',
  },
  team_lead: {
    label: 'Team lead',
    description: 'Manages assigned workspaces, invites members and runs the work.',
  },
  team_member: {
    label: 'Team member',
    description: 'Works inside the workspaces they have been assigned to.',
  },
  client: {
    label: 'Client',
    description: 'Read-only guest with access to their own workspace.',
  },
  user: {
    label: 'Unassigned',
    description: 'Signed up but not yet approved into the organization.',
  },
}

export const SCOPED_ROLE_META: Record<ScopedRole, RoleMeta> = {
  admin: { label: 'Admin', description: 'Full control inside this OS or workspace.' },
  team_lead: { label: 'Team lead', description: 'Manages work and members here.' },
  editor: { label: 'Editor', description: 'Creates and edits, cannot manage access.' },
  analyst: { label: 'Analyst', description: 'Reads data and builds reports.' },
  viewer: { label: 'Viewer', description: 'Read-only.' },
}

/** Higher number = more authority. Used for `minRole` comparisons. */
export const SCOPED_ROLE_RANK: Record<ScopedRole, number> = {
  viewer: 10,
  analyst: 20,
  editor: 30,
  team_lead: 40,
  admin: 50,
}

export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  user: 0,
  client: 10,
  team_member: 20,
  team_lead: 30,
  vp: 40,
  admin: 50,
  superadmin: 60,
}

/**
 * Default scoped role granted inside an OS when a member has no explicit
 * per-OS role. Keeping this mapping in one place is what lets the future RBAC
 * service replace it without touching a single component.
 */
export const DEFAULT_SCOPED_ROLE_FOR_ORG_ROLE: Record<OrgRole, ScopedRole | null> = {
  superadmin: 'admin',
  admin: 'admin',
  vp: 'admin',
  team_lead: 'team_lead',
  team_member: 'editor',
  client: 'viewer',
  user: null,
}
