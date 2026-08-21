'use client'

import type { ReactNode } from 'react'

import type { OSId, ScopedRole } from '@/platform/types'
import { useAccess } from './useAccess'
import type { Capability } from './permissions'

/**
 * Declarative access gate — the platform equivalent of the Reporting OS
 * `<RoleGuard allowed={[...]}>`, but expressed as a capability rather than a
 * role list, so the rule lives in permissions.ts and not in the JSX.
 *
 *   <Can do="members:approve">…</Can>
 *   <Can inOS="reporting" role="team_lead" fallback={<Locked />}>…</Can>
 */
export function Can({
  do: capability,
  inOS,
  role,
  workspace,
  fallback = null,
  children,
}: {
  do?: Capability
  inOS?: OSId
  role?: ScopedRole
  workspace?: string
  fallback?: ReactNode
  children: ReactNode
}) {
  const access = useAccess()

  if (capability && !access.can(capability)) return <>{fallback}</>
  if (inOS && !access.canOpenOS(inOS)) return <>{fallback}</>
  if (inOS && role && !access.meetsRole(inOS, role)) return <>{fallback}</>
  if (inOS && workspace && !access.canOpenWorkspace(inOS, workspace)) return <>{fallback}</>

  return <>{children}</>
}
