'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { integrationService } from '@/lib/mock/services/integrationService'
import { usePlatform } from '@/lib/state/platform-provider'
import { GOOGLE_PROVIDER, providerName } from '@/platform/config/integrations'
import type { ConnectionScope, IntegrationAccount, IntegrationResource, OSId } from '@/platform/types'

import { IntegrationApiError, integrationApi, type GoogleTool } from './api'
import { integrationKeys } from './hooks'
import { GOOGLE_SERVICES, parseAccountId, toolAccountId } from './model'

/**
 * Integration actions for the existing Integrations UI.
 *
 * Live (Clerk): every action calls HiveX's `/api/integrations/*` and then
 * invalidates the affected React Query keys — no local state is written.
 * Demo (no Clerk keys): the original local mock service, unchanged.
 */

const POPUP_TIMEOUT_MS = 10 * 60_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Tools the integrations API connects through Nango (server `nango/index.ts`). */
const TOOL_PROVIDERS = new Set(['slack', 'outlook', 'zoom', 'google-calendar', 'granola', 'fathom', 'intercom', 'notion'])

/** Opened synchronously inside the click so browsers do not block it. */
function openPopup(name: string): Window {
  const width = 520
  const height = 720
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  const popup = window.open('', name, `width=${width},height=${height},left=${left},top=${top}`)
  if (!popup) throw new IntegrationApiError(0, 'The sign-in window was blocked. Allow pop-ups for this site and try again.')
  return popup
}

/** A promise that never settles — the page is navigating away. */
const navigating = () => new Promise<never>(() => undefined)

export interface ConnectResult {
  account: IntegrationAccount
  resources: IntegrationResource[]
}

export function useIntegrationActions() {
  const platform = usePlatform()
  const qc = useQueryClient()
  const live = platform.integrationsMode === 'live'
  const { getToken } = platform.integrationContext

  /* Google: full-page OAuth; Google returns to HiveX, which refreshes on arrival. */
  const startGoogle = useCallback(
    async (clientId: string | undefined, tools?: GoogleTool[]): Promise<never> => {
      if (!clientId) throw new IntegrationApiError(400, 'Choose the client this Google login is for.')
      const returnTo = `${window.location.pathname}${window.location.search}`
      const { url } = await integrationApi.googleConnectUrl(await getToken(), clientId, returnTo, tools)
      window.location.assign(url)
      return navigating()
    },
    [getToken],
  )

  /* Tools: Nango Connect in a popup; completion is the window closing, then finalize. */
  const connectTool = useCallback(
    async (provider: string, popup: Window): Promise<ConnectResult> => {
      try {
        const session = await integrationApi.toolConnectSession(await getToken(), provider)
        if (!session.connect_link) throw new IntegrationApiError(502, `${providerName(provider)} did not return a connect link.`)
        popup.location.href = session.connect_link
      } catch (error) {
        popup.close()
        throw error
      }

      const started = Date.now()
      while (!popup.closed && Date.now() - started < POPUP_TIMEOUT_MS) await sleep(800)
      if (!popup.closed) popup.close()

      try {
        await integrationApi.toolFinalize(await getToken(), provider)
      } catch (error) {
        if (error instanceof IntegrationApiError && error.status === 400) {
          throw new IntegrationApiError(400, `${providerName(provider)} was not connected — the window closed before finishing.`)
        }
        throw error
      } finally {
        await qc.invalidateQueries({ queryKey: integrationKeys.tools() })
      }

      return {
        account: {
          id: toolAccountId(provider),
          provider,
          scope: { kind: 'organization' },
          connectedIn: 'reporting',
          label: providerName(provider),
          externalAccountId: provider,
          status: 'connected',
          services: [provider],
          grantedScopes: [],
          connectedAt: new Date().toISOString(),
          connectedBy: 'You',
        },
        resources: [],
      }
    },
    [getToken, qc],
  )

  /** Authorize one account. Call directly from a click handler (a popup may open before the first await). */
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
        return { account, resources: await integrationService.discoverResources(account) }
      }
      if (provider === GOOGLE_PROVIDER) return startGoogle(options.clientId)
      if (!TOOL_PROVIDERS.has(provider)) {
        throw new IntegrationApiError(501, `${providerName(provider)} is not available yet — the integrations backend does not support it.`)
      }
      return connectTool(provider, openPopup(`hivex-connect-${provider}`))
    },
    [live, startGoogle, connectTool],
  )

  /** Sync now: Google runs the real connector sync for the client; tools refresh their status. */
  const sync = useCallback(
    async (account: IntegrationAccount): Promise<{ syncedAt: string }> => {
      if (!live) return integrationService.syncAccount(account.id)
      const parsed = parseAccountId(account.id)
      if (parsed?.kind === 'google') {
        await integrationApi.syncClient(await getToken(), parsed.clientId)
        await qc.invalidateQueries({ queryKey: integrationKeys.google() })
      } else {
        await qc.refetchQueries({ queryKey: integrationKeys.tools() })
      }
      return { syncedAt: new Date().toISOString() }
    },
    [live, getToken, qc],
  )

  /** Re-authorize the same login; existing assignments are kept. */
  const reconnect = useCallback(
    async (account: IntegrationAccount): Promise<IntegrationAccount> => {
      if (!live) return integrationService.reconnectAccount(account)
      const parsed = parseAccountId(account.id)
      if (parsed?.kind === 'google') return startGoogle(parsed.clientId)
      return (await connectTool(account.provider, openPopup(`hivex-connect-${account.provider}`))).account
    },
    [live, startGoogle, connectTool],
  )

  /** Disconnect on the server: Google per granted tool; tools remove the caller's own connection. */
  const disconnect = useCallback(
    async (account: IntegrationAccount): Promise<void> => {
      if (!live) return integrationService.disconnectAccount(account.id)
      const parsed = parseAccountId(account.id)
      if (parsed?.kind === 'google') {
        const tools = GOOGLE_SERVICES.filter((s) => account.services.includes(s.service)).map((s) => s.tool)
        await integrationApi.disconnectGoogle(await getToken(), parsed.clientId, tools.length ? tools : undefined)
        qc.removeQueries({ queryKey: integrationKeys.googleDiscovery(parsed.clientId) })
        await qc.invalidateQueries({ queryKey: integrationKeys.google() })
        return
      }
      if (parsed?.kind === 'tool') {
        await integrationApi.toolDisconnect(await getToken(), parsed.provider)
        await qc.invalidateQueries({ queryKey: integrationKeys.tools() })
        return
      }
      throw new IntegrationApiError(400, 'This account is not managed by the integrations backend.')
    },
    [live, getToken, qc],
  )

  return { live, authorize, sync, reconnect, disconnect }
}
