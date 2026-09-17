'use client'

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useToast } from '@/components/ui/toast'
import { useIdentity } from '@/lib/state/identity-provider'
import type { IntegrationAccount, IntegrationMapping, IntegrationResource, Workspace } from '@/platform/types'

import { IntegrationApiError, integrationApi, type GoogleDiscovery } from './api'
import { clientToWorkspace, googleAccount, googleMappings, googleResources, toolAccount } from './model'

/**
 * Server state for integrations — TanStack Query on the app's one QueryClient,
 * against HiveX's own `/api/integrations/*`.
 *
 * Freshness: there is no push channel for integration status in the shared
 * infrastructure (Reporting OS also refetches), so this uses
 *   - refetch on window focus for every integration query,
 *   - targeted invalidation after each mutation (see actions.ts),
 *   - invalidation when the browser returns from Google OAuth,
 *   - polling only while a Nango popup is open.
 */

export const integrationKeys = {
  all: ['integrations'] as const,
  clients: () => [...integrationKeys.all, 'clients'] as const,
  google: () => [...integrationKeys.all, 'google'] as const,
  googleStatus: () => [...integrationKeys.google(), 'status'] as const,
  googleDiscovery: (clientId: string) => [...integrationKeys.google(), 'discovery', clientId] as const,
  tools: () => [...integrationKeys.all, 'tools'] as const,
  toolTargets: (provider: string) => [...integrationKeys.tools(), 'targets', provider] as const,
}

const FRESHNESS = { staleTime: 15_000, refetchOnWindowFocus: true } as const

/* Stable reference: TanStack Query then keeps the combined result stable
   between renders while the underlying query data is unchanged. */
const discoveryData = (results: { data?: GoogleDiscovery }[]) => results.map((r) => r.data)

export interface LiveIntegrations {
  accounts: IntegrationAccount[]
  resources: IntegrationResource[]
  mappings: IntegrationMapping[]
  /** The caller's clients, as HiveX Reporting OS workspaces. */
  clients: Workspace[]
  isLoading: boolean
  error: string | null
  getToken: () => Promise<string>
}

export function useLiveIntegrations(enabled: boolean, organizationId: string): LiveIntegrations {
  const identity = useIdentity()
  const { getToken: identityToken } = identity
  const active = enabled && identity.isLoaded && identity.isSignedIn

  const getToken = useCallback(async () => {
    const token = await identityToken()
    if (!token) throw new IntegrationApiError(401, 'Your session has expired. Sign in again.')
    return token
  }, [identityToken])

  const clientsQuery = useQuery({
    queryKey: integrationKeys.clients(),
    enabled: active,
    ...FRESHNESS,
    queryFn: async () => integrationApi.listClients(await getToken()),
  })

  const statusQuery = useQuery({
    queryKey: integrationKeys.googleStatus(),
    enabled: active,
    ...FRESHNESS,
    queryFn: async () => integrationApi.googleStatus(await getToken()),
  })

  const connected = useMemo(() => (statusQuery.data ?? []).filter((s) => s.connected), [statusQuery.data])

  const discovery = useQueries({
    queries: connected.map((status) => ({
      queryKey: integrationKeys.googleDiscovery(status.client_id),
      enabled: active,
      ...FRESHNESS,
      queryFn: async () => integrationApi.googleDiscovery(await getToken(), status.client_id),
    })),
    combine: discoveryData,
  })

  const toolsQuery = useQuery({
    queryKey: integrationKeys.tools(),
    enabled: active,
    ...FRESHNESS,
    queryFn: async () => integrationApi.toolStatus(await getToken()),
  })

  const discoveryByClient = useMemo(() => {
    const map = new Map<string, GoogleDiscovery>()
    discovery.forEach((d) => {
      if (d) map.set(d.client_id, d)
    })
    return map
  }, [discovery])

  const derived = useMemo(() => {
    const names = new Map((clientsQuery.data ?? []).map((c) => [c.id, c.name?.trim() || c.key]))
    const accounts: IntegrationAccount[] = []
    const resources: IntegrationResource[] = []
    const mappings: IntegrationMapping[] = []

    connected.forEach((status) => {
      accounts.push(googleAccount(names.get(status.client_id) ?? 'Client', status))
      mappings.push(...googleMappings(status))
      const found = discoveryByClient.get(status.client_id)
      if (found) resources.push(...googleResources(status.client_id, found))
    })
    ;(toolsQuery.data?.connected_providers ?? []).forEach((provider) => accounts.push(toolAccount(provider)))

    return { accounts, resources, mappings }
  }, [clientsQuery.data, connected, discoveryByClient, toolsQuery.data])

  const clients = useMemo(
    () => (clientsQuery.data ?? []).map((c) => clientToWorkspace(c, organizationId)),
    [clientsQuery.data, organizationId],
  )

  useOAuthReturn(active)

  const firstError = [clientsQuery.error, statusQuery.error, toolsQuery.error].find(Boolean)
  const errorMessage = firstError instanceof Error ? firstError.message : null
  useErrorToast(errorMessage)

  return {
    ...derived,
    clients,
    isLoading: active && (clientsQuery.isLoading || statusQuery.isLoading),
    error: errorMessage,
    getToken,
  }
}

/** Tells the user once when integrations cannot load (e.g. the server is not configured). */
function useErrorToast(message: string | null) {
  const toast = useToast()
  const shown = useRef<string | null>(null)
  useEffect(() => {
    if (!message || shown.current === message) return
    shown.current = message
    toast.error('Integrations could not be loaded', message)
  }, [message, toast])
}

/**
 * Picks up the result Google OAuth sends back (`?google=connected|error`),
 * refreshes the affected queries, tells the user, and cleans the URL.
 */
function useOAuthReturn(active: boolean) {
  const qc = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const outcome = url.searchParams.get('google')
    if (!outcome) return

    if (outcome === 'connected') {
      const failed = url.searchParams.get('discovery_errors')
      void qc.invalidateQueries({ queryKey: integrationKeys.google() })
      toast.success(
        'Google connected',
        failed ? `Connected, but discovery failed for: ${failed.replace(/,/g, ', ')}.` : 'Discovered resources are ready to assign.',
      )
    } else {
      toast.error('Google was not connected', url.searchParams.get('message') ?? undefined)
    }

    ;['google', 'client', 'message', 'discovery_errors'].forEach((key) => url.searchParams.delete(key))
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [active, qc, toast])
}
