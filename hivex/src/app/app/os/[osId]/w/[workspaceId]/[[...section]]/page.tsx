'use client'

import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { ArrowLeft, Blocks, ShieldAlert } from 'lucide-react'
import { useEffect } from 'react'

import { ModulePlaceholder } from '@/components/os/os-kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/data'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { PageBody, PageHeader, PageTransition } from '@/components/ui/page'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { OS_REGISTRY, findNavItem, isOSId } from '@/platform/config/os-registry'
import { resolveView } from '@/os/registry'
import type { OSId, WorkspaceHealth } from '@/platform/types'

/**
 * The workspace route.
 *
 * One file serves every product and every section:
 *
 *   1. resolve OS + workspace from the URL
 *   2. check workspace access and the section's minimum role
 *   3. look the section component up in the OS view registry
 *   4. render it inside the shared workspace header
 *
 * No product-specific branching. A new OS becomes routable the moment it is
 * registered in src/os/registry.ts.
 */

const HEALTH: Record<WorkspaceHealth, { tone: 'success' | 'warning' | 'destructive'; label: string }> = {
  healthy: { tone: 'success', label: 'Healthy' },
  attention: { tone: 'warning', label: 'Needs attention' },
  at_risk: { tone: 'destructive', label: 'At risk' },
}

export default function WorkspaceSectionPage() {
  const params = useParams<{ osId: string; workspaceId: string; section?: string[] }>()
  const access = useAccess()
  const { visit, workspaces, workspaceStatus } = usePlatform()

  const osId = params.osId
  const workspaceId = params.workspaceId
  const sectionId = (params.section ?? []).join('/')

  useEffect(() => {
    if (isOSId(osId) && workspaceId) visit(osId as OSId, workspaceId)
  }, [osId, workspaceId, visit])

  if (!isOSId(osId)) notFound()

  const os = OS_REGISTRY[osId]
  const workspace = (workspaces[osId] ?? []).find((w) => w.id === workspaceId)

  /* Products whose workspaces come from a service (HR OS) have nothing to look
     up until that first load resolves — showing "not found" in the meantime
     would make a refresh on a valid URL look broken. */
  if (!workspace && workspaceStatus[osId] === 'loading') {
    return (
      <PageTransition>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageTransition>
    )
  }

  if (!workspace) {
    return (
      <PageTransition>
        <EmptyState
          title={`${os.workspaceNoun.singular} not found`}
          description={
            workspaceStatus[osId] === 'error'
              ? `The ${os.name} service could not be reached, so its ${os.workspaceNoun.plural.toLowerCase()} could not be loaded.`
              : 'It may have been renamed, archived, or you followed an old link.'
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/os/${os.id}`}>
                <ArrowLeft className="size-4" />
                Back to {os.workspaceNoun.plural.toLowerCase()}
              </Link>
            </Button>
          }
        />
      </PageTransition>
    )
  }

  const workspaceVerdict = access.workspaceAccess(osId, workspaceId)
  if (!workspaceVerdict.allowed) {
    return <AccessDenied message={workspaceVerdict.message} osId={osId} />
  }

  const navItem = findNavItem(os, sectionId)
  if (sectionId && !navItem) notFound()

  if (navItem?.minRole && !access.meetsRole(osId, navItem.minRole)) {
    return (
      <AccessDenied
        message={`${navItem.label} requires the ${navItem.minRole.replace('_', ' ')} role in ${os.name}.`}
        osId={osId}
      />
    )
  }

  const View = resolveView(osId, sectionId)
  const health = HEALTH[workspace.health]

  return (
    <PageTransition key={`${workspaceId}-${sectionId}`}>
      <PageBody>
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              {os.name}
              <span className="text-muted-foreground/50">·</span>
              {os.workspaceNoun.singular}
              <Badge tone={health.tone} dot>
                {health.label}
              </Badge>
            </span>
          }
          title={
            <span className="flex items-center gap-3">
              <Avatar name={workspace.name} hue={workspace.accent} size="lg" square />
              <span className="min-w-0">
                <span className="block truncate">{workspace.name}</span>
                {navItem && navItem.id ? (
                  <span className="block text-sm font-normal text-muted-foreground">
                    {navItem.label}
                  </span>
                ) : null}
              </span>
            </span>
          }
          description={navItem?.description ?? workspace.description}
          /*
           * No Ask Tru here. A workspace is a client, and Ask Tru is not
           * offered on client-specific pages — the rule lives in
           * platform/config/ask-tru.ts and the top bar honours it too.
           */
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/os/${os.id}/integrations`}>
                <Blocks className="size-4" />
                Integrations
              </Link>
            </Button>
          }
        />

        {View ? (
          <View os={os} workspace={workspace} />
        ) : (
          <ModulePlaceholder
            icon={navItem?.icon}
            title={`${navItem?.label ?? 'This module'} is not built yet`}
            description={`${os.name} is registered with this module in its navigation, but the screen has not been implemented in this build.`}
            bullets={os.navigation.filter((item) => item.id).map((item) => item.label)}
          />
        )}
      </PageBody>
    </PageTransition>
  )
}

function AccessDenied({ message, osId }: { message?: string; osId: OSId }) {
  const os = OS_REGISTRY[osId]
  return (
    <PageTransition>
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ShieldAlert className="size-5" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold">You do not have access</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {message ?? 'This area has not been shared with your role.'}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link href={`/app/os/${os.id}`}>
            <ArrowLeft className="size-4" />
            Back to {os.name}
          </Link>
        </Button>
      </div>
    </PageTransition>
  )
}
