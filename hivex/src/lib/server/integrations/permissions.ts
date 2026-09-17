import 'server-only'

import type { UserProfile } from './context'

/**
 * Port of the Reporting backend's `lib/rbac/permissions.py#has_permission`,
 * limited to the client-scoped checks the integrations API needs.
 * Level ladder: none < read < write < admin. Absent key = deny.
 */

type Level = 'none' | 'read' | 'write' | 'admin'

const RANK: Record<Level, number> = { none: 0, read: 1, write: 2, admin: 3 }

const rank = (level: unknown) =>
  typeof level === 'string' ? (RANK[level.toLowerCase() as Level] ?? 0) : 0

function legacyCanAccessClient(profile: UserProfile, clientId: string): boolean {
  const role = (profile.role ?? '').toLowerCase()
  const raw = profile.client_ids
  const ids = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? safeIds(raw) : []
  if ((role === 'admin' || role === 'vp') && ids.length === 0) return true
  return ids.includes(String(clientId))
}

function safeIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function hasPermission(
  profile: UserProfile,
  resource: string,
  { clientId, minLevel = 'read' }: { clientId?: string; minLevel?: Level } = {},
): boolean {
  const permissions = profile.permissions as
    | (UserProfile['permissions'] & { clients?: Record<string, { data_sources?: Record<string, unknown>; features?: Record<string, unknown> }> })
    | null
    | undefined

  if (!permissions || typeof permissions !== 'object') {
    const role = (profile.role ?? '').toLowerCase()
    if (role === 'admin' || role === 'vp') return true
    if (/^(client|data_source|feature)/.test(resource)) {
      return clientId ? legacyCanAccessClient(profile, clientId) : false
    }
    return false
  }

  if (permissions.global?.is_super_admin === true) return true
  if (!clientId) return false

  const block = permissions.clients?.[String(clientId)]
  if (!block || typeof block !== 'object') return false
  if (resource === 'client') return true
  if (resource.startsWith('data_source.')) {
    return rank(block.data_sources?.[resource.slice('data_source.'.length)]) >= RANK[minLevel]
  }
  if (resource.startsWith('feature.')) {
    return rank(block.features?.[resource.slice('feature.'.length)]) >= RANK[minLevel]
  }
  return false
}
