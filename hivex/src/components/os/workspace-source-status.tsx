'use client'

import { RefreshCw, ServerCrash } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePlatform } from '@/lib/state/platform-provider'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { OS_WORKSPACE_SOURCES } from '@/os/workspace-sources'
import type { OSId } from '@/platform/types'

/**
 * Explains an empty workspace list when the cause is a service, not an empty
 * organization.
 *
 * Products whose workspaces come from a service can legitimately show zero
 * workspaces for two very different reasons. Without this, "nothing set up yet"
 * and "the backend is down" look identical — and only one of them is the user's
 * problem to fix.
 *
 * Renders nothing for fixture-backed products, and nothing while healthy.
 */
export function WorkspaceSourceStatus({ osId }: { osId: OSId }) {
  const { workspaceStatus, workspaceError, reloadWorkspaces } = usePlatform()
  const [retrying, setRetrying] = useState(false)

  if (!OS_WORKSPACE_SOURCES[osId]) return null
  if (workspaceStatus[osId] !== 'error') return null

  const os = OS_REGISTRY[osId]

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <ServerCrash className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-medium">
            The {os.name} service is not reachable
          </p>
          <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
            {os.workspaceNoun.plural} come from that service, so none can be listed.
            {workspaceError[osId] ? ` ${workspaceError[osId]}` : ''}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        loading={retrying}
        onClick={async () => {
          setRetrying(true)
          await reloadWorkspaces(osId)
          setRetrying(false)
        }}
      >
        {!retrying ? <RefreshCw className="size-3.5" /> : null}
        Retry
      </Button>
    </div>
  )
}
