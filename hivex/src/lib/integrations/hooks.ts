'use client'

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { useIdentity } from '@/lib/state/identity-provider'
import type { IntegrationAccount, IntegrationMapping, IntegrationResource, Workspace } from '@/platform/types'

import { IntegrationApiError, integrationApi, type DataWorkspace } from './api'
import {
  clientToWorkspace,
  googleAccount,
  googleMappings,
  googleResources,
  nangoAccount,
} from './model'

/**
 * Server state for integrations, via TanStack Query on the app's one QueryClient.
 *
 * Synchronisation: the backend exposes no push channel for integration status
 * (no WebSocket event, no realtime table), so freshness comes from
 *   - refetch on window focus for every integration query — returning from an
 *     OAuth popup or another tab brings the latest state,
 *   - targeted invalidation after every mutation (see actions.ts),
 *   - short polling while an OAuth/Connect popup is open (see actions.ts).
 */

export const integrationKeys = {
  all: ['integrations'] as const,
  clients: () => [...integrationKeys.all, 'clients'] as const,
  workspaces: () => [...integrationKeys.all, 'data-workspaces'] as const,
  googleStatus: (workspaceId: string) => [...integrationKeys.all, 'google-status', workspaceId] as const,
  googleDiscovery: (workspaceId: string) => [...integrationKeys.all, 'google-discovery', workspaceId] as const,
  nangoStatus: (workspaceId: string) => [...integrationKeys.all, 'nango-status', workspaceId] as const,
}

const FRESHNESS = { staleTime: 15_000, refetchOnWindowFocus: true } as const

export interface LiveIntegrations {
  accounts: IntegrationAccount[]
  resources: IntegrationResource[]
  mappings: IntegrationMapping[]
  /** The caller's Reporting clients, as HiveX workspaces. */
  clients: Workspace[]
  isLoading: boolean
  error: string | null
  /** Data workspace for a client — resolved from the authenticated workspace list. */
  workspaceIdForClient: (clientId: string) => string | null
  /** Workspace tool connectors attach to: the first the caller can see, as in Reporting OS. */
  primaryWorkspaceId: string | null
  getToken: () => Promise<string>
}

export function useLiveIntegrations(enabled: boolean, organizationId: string): LiveIntegrations {
  const identity = useIdentity()
  const { getToken: identityToken } = identity
  const active = enabled && identity.isLoaded && identity.isSignedIn

  const getToken = useCallback(async () => {
    const token = await identityToken()
    if (!token) throw new IntegrationApiError(401, 'Your session has expired. Sign in again and retry.')
    return token
  }, [identityToken])

  const clientsQuery = useQuery({
    queryKey: integrationKeys.clients(),
    enabled: active,
    ...FRESHNESS,
    queryFn: async () => integrationApi.listClients(await getToken()),
  })

  const workspacesQuery = useQuery({
    queryKey: integrationKeys.workspaces(),
    enabled: active,
    ...FRESHNESS,
    queryFn: async () => integrationApi.listDataWorkspaces(await getToken()),
  })

  /* Only data workspaces attached to a client this user can see. */
  const clientWorkspaces = useMemo(() => {
    const clients = new Map((clientsQuery.data ?? []).map((c) => [c.id, c]))
    return (workspacesQuery.data ?? []).flatMap((workspace) => {
      const client = workspace.connected_to ? clients.get(workspace.connected_to) : undefined
      return client ? [{ workspace, client }] : []
    })
  }, [clientsQuery.data, workspacesQuery.data])

  const statusQueries = useQueries({
    queries: clientWorkspaces.map(({ workspace }) => ({
      queryKey: integrationKeys.googleStatus(workspace.id),
      enabled: active,
      ...FRESHNESS,
      queryFn: () => integrationApi.googleStatus(workspace.id),
    })),
  })

  const connected = clientWorkspaces.filter((_, i) => statusQueries[i]?.data?.connected)

  const discoveryQueries = useQueries({
    queries: connected.map(({ workspace }) => ({
      queryKey: integrationKeys.googleDiscovery(workspace.id),
      enabled: active,
      ...FRESHNESS,
      queryFn: () => integrationApi.googleDiscovery(workspace.id),
    })),
  })

  const primaryWorkspaceId = workspacesQuery.data?.[0]?.id ?? null

  const nangoQuery = useQuery({
    queryKey: integrationKeys.nangoStatus(primaryWorkspaceId ?? ''),
    enabled: active && Boolean(primaryWorkspaceId),
    ...FRESHNESS,
    queryFn: async () => integrationApi.nangoStatus(await getToken(), primaryWorkspaceId!),
  })

  const statusData = statusQueries.map((q) => q.data)
  const discoveryData = discoveryQueries.map((q) => q.data)

  const derived = useMemo(() => {
    const accounts: IntegrationAccount[] = []
    const resources: IntegrationResource[] = []
    const mappings: IntegrationMapping[] = []

    clientWorkspaces.forEach(({ workspace, client }, i) => {
      const status = statusData[i]
      if (!status?.connected) return
      const clientName = client.name?.trim() || client.key
      accounts.push(googleAccount(workspace, client.id, clientName, status))
      mappings.push(...googleMappings(workspace.id, client.id, status))
      const discoveryIndex = connected.findIndex((c) => c.workspace.id === workspace.id)
      const discovery = discoveryData[discoveryIndex]
      if (discovery) resources.push(...googleResources(workspace.id, discovery))
    })

    if (primaryWorkspaceId) {
      ;(nangoQuery.data?.connected_providers ?? []).forEach((provider) => {
        accounts.push(nangoAccount(provider, primaryWorkspaceId))
      })
    }

    return { accounts, resources, mappings }
    // statusData/discoveryData are fresh arrays each render; their contents drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientWorkspaces, JSON.stringify(statusData), JSON.stringify(discoveryData), nangoQuery.data, primaryWorkspaceId])

  const clients = useMemo(
    () => (clientsQuery.data ?? []).map((c) => clientToWorkspace(c, organizationId)),
    [clientsQuery.data, organizationId],
  )

  const workspaceIdForClient = useCallback(
    (clientId: string) => clientWorkspaces.find((c) => c.client.id === clientId)?.workspace.id ?? null,
    [clientWorkspaces],
  )

  const firstError = [clientsQuery.error, workspacesQuery.error, nangoQuery.error, ...statusQueries.map((q) => q.error)].find(Boolean)

  return {
    ...derived,
    clients,
    isLoading: active && (clientsQuery.isLoading || workspacesQuery.isLoading),
    error: firstError instanceof Error ? firstError.message : null,
    workspaceIdForClient,
    primaryWorkspaceId,
    getToken,
  }
}

/** Refresh everything integration-related — used after mutations and popups. */
export function useInvalidateIntegrations() {
  const qc = useQueryClient()
  return useCallback(
    (workspaceId?: string) => {
      if (workspaceId) {
        void qc.invalidateQueries({ queryKey: integrationKeys.googleStatus(workspaceId) })
        void qc.invalidateQueries({ queryKey: integrationKeys.googleDiscovery(workspaceId) })
        void qc.invalidateQueries({ queryKey: integrationKeys.nangoStatus(workspaceId) })
        return
      }
      void qc.invalidateQueries({ queryKey: integrationKeys.all })
    },
    [qc],
  )
}

export type { DataWorkspace }
