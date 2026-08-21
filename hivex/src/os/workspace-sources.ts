import type { OSId, Workspace } from '@/platform/types'

import { loadHRWorkspaces } from './hr/workspace-source'

/**
 * Remote workspace sources.
 *
 * Most products in this build still serve workspaces from fixtures. HR OS does
 * not — its workspaces are the clients held by `services/hr-os`. Rather than
 * special-casing HR inside the platform provider, an OS declares a loader here
 * and the provider swaps that slice of workspace state once it resolves.
 *
 * Deliberately kept free of component imports: the platform provider imports
 * this module, and anything with a UI dependency would close an import cycle.
 */
export type WorkspaceLoader = () => Promise<Workspace[]>

export interface WorkspaceSource {
  load: WorkspaceLoader
  /** Present when the product's own service owns creation. */
  create?: (name: string) => Promise<void>
}

export const OS_WORKSPACE_SOURCES: Partial<Record<OSId, WorkspaceSource>> = {
  hr: {
    load: loadHRWorkspaces,
    create: async (name) => {
      const { hrApi } = await import('./hr/api/client')
      await hrApi.createClient(name)
    },
  },
}

export type WorkspaceLoadStatus = 'idle' | 'loading' | 'ready' | 'error'
