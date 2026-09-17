'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { integrationService } from '@/lib/mock/services/integrationService'
import { usePlatform } from '@/lib/state/platform-provider'
import { GOOGLE_PROVIDER, providerName } from '@/platform/config/integrations'
import type { ConnectionScope, IntegrationAccount, IntegrationResource, OSId } from '@/platform/types'

import { IntegrationApiError, integrationApi } from './api'
import { integrationKeys } from './hooks'
import {
  ALL_GOOGLE_TOOLS,
  GOOGLE_SERVICES,
  googleAccountId,
  googleResources,
  isNangoProvider,
  nangoAccountId,
  parseAccountId,
} from './model'

/**
 * Integration actions for the existing Integrations UI.
 *
 * Live (Clerk + NEXT_PUBLIC_BASE_URL): every action is a real backend call,
 * followed by React Query invalidation — nothing is written to local state.
 * Demo (no keys): the original local mock service, unchanged.
 */

const POLL_MS = 1_500
const POPUP_TIMEOUT_MS = 10 * 60_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Opens the popup synchronously, inside the user's click, so browsers do not
 * block it; the URL is filled in once it is known.
 */
function openPopup(name: string): Window {
  const width = 520
  const height = 720
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  const popup = window.open('', name, `width=${width},height=${height},left=${left},top=${top}`)
  if (!popup) {
    throw new IntegrationApiError(0, 'The sign-in window was blocked. Allow pop-ups for this site and try again.')
  }
  return popup
}

export interface ConnectResult {
  account: IntegrationAccount
  resources: IntegrationResource[]
}

export function useIntegrationActions() {
  const platform = usePlatform()
  const qc = useQueryClient()
  const live = platform.integrationsMode === 'live'
  const { integrationContext } = platform

  /* ------------------------------------------------------------ Google */

  const connectGoogle = useCallback(
    async (clientId: string | undefined, popup: Window): Promise<ConnectResult> => {
      if (!clientId) {
        popup.close()
        throw new IntegrationApiError(400, 'Choose the client this Google login is for.')
      }
      const workspaceId = integrationContext.workspaceIdForClient(clientId)
      if (!workspaceId) {
        popup.close()
        throw new IntegrationApiError(
          404,
          'This client has no data workspace yet, so it cannot hold a Google connection. Create the client in Tru Reporting first.',
        )
      }

      /* Baseline, to tell a fresh grant from what was already there. */
      const before = await integrationApi.googleStatus(workspaceId).catch(() => null)
      const beforeScopes = new Set(before?.scopes_granted ?? [])

      popup.location.href = integrationApi.googleStartUrl(workspaceId, ALL_GOOGLE_TOOLS)

      /*
       * Google's callback redirects the popup to the Tru Reporting app, never
       * back here, so completion is observed from the backend: the connection
       * appears or its granted scopes change. A user who re-grants identical
       * scopes finishes by closing the window.
       */
      const started = Date.now()
      let completed = false
      while (Date.now() - started < POPUP_TIMEOUT_MS) {
        await sleep(POLL_MS)
        const closed = popup.closed
        const now = await integrationApi.googleStatus(workspaceId).catch(() => null)
        const scopes = now?.scopes_granted ?? []
        const changed =
          Boolean(now?.connected) &&
          (!before?.connected || scopes.length !== beforeScopes.size || scopes.some((s) => !beforeScopes.has(s)))
        if (changed || (closed && now?.connected)) {
          completed = true
          break
        }
        if (closed) break
      }
      if (!popup.closed) popup.close()

      await qc.invalidateQueries({ queryKey: integrationKeys.googleStatus(workspaceId) })
      await qc.invalidateQueries({ queryKey: integrationKeys.googleDiscovery(workspaceId) })

      if (!completed) {
        throw new IntegrationApiError(
          0,
          'Google sign-in was not completed. If you declined access or closed the window early, try again.',
        )
      }

      const status = await integrationApi.googleStatus(workspaceId)
      const discovery = await integrationApi.googleDiscovery(workspaceId).catch(() => null)
      const client = platform.workspaces.reporting?.find((w) => w.id === clientId)
      const granted = GOOGLE_SERVICES.filter((s) => (status.scopes_granted ?? []).includes(s.scope))
      return {
        account: {
          id: googleAccountId(workspaceId),
          provider: GOOGLE_PROVIDER,
          scope: { kind: 'client', osId: 'reporting', workspaceId: clientId },
          connectedIn: 'reporting',
          label: `${client?.name ?? 'Client'} · Google`,
          externalAccountId: workspaceId,
          status: 'connected',
          services: granted.map((s) => s.service),
          grantedScopes: granted.map((s) => s.shortScope),
          connectedAt: new Date().toISOString(),
          connectedBy: 'You',
        },
        resources: discovery ? googleResources(workspaceId, discovery) : [],
      }
    },
    [integrationContext, platform.workspaces.reporting, qc],
  )

  /* ------------------------------------------------------------ Nango */

  const connectNango = useCallback(
    async (provider: string, popup: Window): Promise<ConnectResult> => {
      const workspaceId = integrationContext.primaryWorkspaceId
      if (!workspaceId) {
        popup.close()
        throw new IntegrationApiError(
          404,
          'No data workspace is available for your account yet, so tools cannot be connected.',
        )
      }
      const token = await integrationContext.getToken()

      let session
      try {
        session = await integrationApi.nangoConnectSession(token, provider, workspaceId)
      } catch (error) {
        popup.close()
        throw error
      }
      if (!session.connect_link) {
        popup.close()
        throw new IntegrationApiError(502, `${providerName(provider)} did not return a connect link.`)
      }
      popup.location.href = session.connect_link

      /* Same completion signal Reporting OS uses: the Connect window closes. */
      const started = Date.now()
      while (!popup.closed && Date.now() - started < POPUP_TIMEOUT_MS) {
        await sleep(800)
      }
      if (!popup.closed) popup.close()

      try {
        await integrationApi.nangoFinalize(await integrationContext.getToken(), provider, workspaceId)
      } catch (error) {
        if (error instanceof IntegrationApiError && error.status === 400) {
          throw new IntegrationApiError(400, `${providerName(provider)} was not connected — the connection window closed before finishing.`)
        }
        throw error
      } finally {
        await qc.invalidateQueries({ queryKey: integrationKeys.nangoStatus(workspaceId) })
      }

      return {
        account: {
          id: nangoAccountId(provider),
          provider,
          scope: { kind: 'organization' },
          connectedIn: 'reporting',
          label: providerName(provider),
          externalAccountId: workspaceId,
          status: 'connected',
          services: [provider],
          grantedScopes: [],
          connectedAt: new Date().toISOString(),
          connectedBy: 'You',
        },
        resources: [],
      }
    },
    [integrationContext, qc],
  )

  /* ------------------------------------------------------------ public */

  /**
   * Authorize one account. Must be called directly from a click handler: the
   * provider window is opened before the first await.
   */
  const authorize = useCallback(
    async (
      provider: string,
      options: { scope: ConnectionScope; osId: OSId; clientId?: string; existingLabels: string[]; label?: string },
    ): Promise<ConnectResult> => {
      if (!live) {
        const account = await integrationService.authorizeAccount(provider, options.scope, {
          ...(options.label ? { label: options.label } : {}),
          existingLabels: options.existingLabels,
          connectedIn: options.osId,
        })
        const resources = await integrationService.discoverResources(account)
        return { account, resources }
      }

      if (provider !== GOOGLE_PROVIDER && !isNangoProvider(provider)) {
        throw new IntegrationApiError(
          501,
          `${providerName(provider)} is not available yet — the integrations backend does not support it.`,
        )
      }

      const popup = openPopup(`hivex-connect-${provider}`)
      return provider === GOOGLE_PROVIDER
        ? connectGoogle(options.clientId, popup)
        : connectNango(provider, popup)
    },
    [live, connectGoogle, connectNango],
  )

  /** Sync now. Google: the backend's per-client connector sync. Tools: refresh status. */
  const sync = useCallback(
    async (account: IntegrationAccount): Promise<{ syncedAt: string }> => {
      if (!live) return integrationService.syncAccount(account.id)

      const parsed = parseAccountId(account.id)
      if (parsed?.kind === 'google' && account.scope.kind === 'client') {
        await integrationApi.syncClient(await integrationContext.getToken(), account.scope.workspaceId)
        await qc.invalidateQueries({ queryKey: integrationKeys.all })
      } else {
        await qc.refetchQueries({ queryKey: integrationKeys.all })
      }
      return { syncedAt: new Date().toISOString() }
    },
    [live, integrationContext, qc],
  )

  /** Re-authorize the same login, keeping backend mappings. */
  const reconnect = useCallback(
    async (account: IntegrationAccount): Promise<IntegrationAccount> => {
      if (!live) return integrationService.reconnectAccount(account)
      const clientId = account.scope.kind === 'client' ? account.scope.workspaceId : undefined
      const popup = openPopup(`hivex-connect-${account.provider}`)
      const result =
        account.provider === GOOGLE_PROVIDER
          ? await connectGoogle(clientId, popup)
          : await connectNango(account.provider, popup)
      return result.account
    },
    [live, connectGoogle, connectNango],
  )

  /**
   * Disconnect on the backend.
   *
   * Google: the backend disconnects per tool; every tool this login granted is
   * disconnected, which removes its tokens and, once none remain, the
   * connection itself. Tools: the caller's own Nango connection is removed.
   */
  const disconnect = useCallback(
    async (account: IntegrationAccount): Promise<void> => {
      if (!live) return integrationService.disconnectAccount(account.id)

      const parsed = parseAccountId(account.id)
      if (parsed?.kind === 'google') {
        const tools = GOOGLE_SERVICES.filter((s) => account.services.includes(s.service)).map((s) => s.tool)
        for (const tool of tools.length > 0 ? tools : ALL_GOOGLE_TOOLS) {
          try {
            await integrationApi.disconnectGoogleTool(parsed.workspaceId, tool)
          } catch (error) {
            // Nothing left to remove for this tool (the connection is already gone).
            if (!(error instanceof IntegrationApiError && error.status === 404)) throw error
          }
        }
        await qc.invalidateQueries({ queryKey: integrationKeys.googleStatus(parsed.workspaceId) })
        qc.removeQueries({ queryKey: integrationKeys.googleDiscovery(parsed.workspaceId) })
        return
      }
      if (parsed?.kind === 'nango') {
        const workspaceId = account.externalAccountId
        await integrationApi.nangoDisconnect(await integrationContext.getToken(), parsed.provider, workspaceId)
        await qc.invalidateQueries({ queryKey: integrationKeys.nangoStatus(workspaceId) })
        return
      }
      throw new IntegrationApiError(400, 'This account is not managed by the integrations backend.')
    },
    [live, integrationContext, qc],
  )

  return { live, authorize, sync, reconnect, disconnect }
}
