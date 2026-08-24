import type {
  AffectedClient,
  ConnectionScope,
  DisconnectImpact,
  IntegrationAccount,
  IntegrationMapping,
  IntegrationResource,
  OSId,
} from '@/platform/types'
import { GOOGLE_PROVIDER, providerName } from '@/platform/config/integrations'

import {
  DEMO_ACCOUNTS,
  DEMO_MAPPINGS,
  DEMO_RESOURCES,
  DISCOVERY_ACCOUNT_LABELS,
  DISCOVERY_TEMPLATES,
} from '../data/integrations'
import { latency } from '../seed'

/**
 * Mock integration service.
 *
 * Stands in for two real pipelines, both of which have the same three-step
 * shape — authorize an account, discover what it exposes, then map resources:
 *
 *   Google:  GET /auth/google/start -> /auth/google/callback ->
 *            GET /auth/google/discovery -> POST /auth/workspace/map
 *   Nango:   POST /api/v1/nango/connect-session -> Connect UI ->
 *            POST /api/v1/nango/finalize-connection
 *
 * Every function returns the same domain types the real endpoints would, so
 * swapping this file for `fetchWithAuth` calls changes no caller.
 */

export const SEEDED_ACCOUNTS = DEMO_ACCOUNTS
export const SEEDED_RESOURCES = DEMO_RESOURCES
export const SEEDED_MAPPINGS = DEMO_MAPPINGS

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}_${Date.now().toString(36)}${sequence}`
}

export const integrationService = {
  /** GET /api/v1/integrations — every account in scope. */
  async listAccounts(): Promise<IntegrationAccount[]> {
    await latency(200)
    return DEMO_ACCOUNTS
  },

  /**
   * Opens the provider's consent screen and returns the authorized identity.
   *
   * In production this is a popup to the Google OAuth URL or the Nango Connect
   * UI. The delay is what makes the `connecting` state worth rendering.
   */
  async authorizeAccount(
    provider: string,
    scope: ConnectionScope,
    options: { label?: string; existingLabels?: string[]; connectedIn: OSId },
  ): Promise<IntegrationAccount> {
    await latency(1_200)

    if (provider === 'wappalyzer') {
      throw new Error(
        'Provider slug could not be resolved. Confirm the Nango integration id on the dashboard before connecting.',
      )
    }

    const taken = new Set(options.existingLabels ?? [])
    const label =
      options.label ??
      DISCOVERY_ACCOUNT_LABELS.find((candidate) => !taken.has(candidate)) ??
      `account${taken.size + 1}@agency.com`

    return {
      id: nextId('acct'),
      provider,
      scope,
      connectedIn: options.connectedIn,
      label,
      externalAccountId: nextId('ext').replace(/\D/g, '').padEnd(21, '0').slice(0, 21),
      status: 'connected',
      services:
        provider === GOOGLE_PROVIDER
          ? ['ga4', 'gsc', 'google-ads', 'gbp']
          : [provider],
      grantedScopes:
        provider === GOOGLE_PROVIDER
          ? ['analytics.readonly', 'webmasters.readonly', 'adwords', 'business.manage']
          : ['read'],
      connectedAt: new Date().toISOString(),
      connectedBy: 'Alex Mercer',
      lastSyncAt: new Date().toISOString(),
    }
  },

  /**
   * GET /auth/google/discovery, or the Nango proxy list-targets call.
   *
   * Discovery is what the provider says the account can see — the user never
   * types a property id by hand.
   */
  async discoverResources(account: IntegrationAccount): Promise<IntegrationResource[]> {
    await latency(900)
    const template = DISCOVERY_TEMPLATES[account.provider] ?? []
    return template.map((entry, index) => ({
      ...entry,
      id: `${account.id}_r${index}`,
      accountId: account.id,
    }))
  },

  /** POST /auth/workspace/map — associate a resource with a client. */
  async mapResource(
    resource: IntegrationResource,
    osId: IntegrationMapping['osId'],
    workspaceId: string,
  ): Promise<IntegrationMapping> {
    await latency(420)
    return {
      id: nextId('map'),
      resourceId: resource.id,
      osId,
      workspaceId,
      mappedAt: new Date().toISOString(),
      mappedBy: 'Alex Mercer',
    }
  },

  async unmapResource(mappingId: string): Promise<void> {
    await latency(320)
    void mappingId
  },

  /**
   * What breaks if this account goes away.
   *
   * Computed before the confirmation dialog rather than after, because the
   * whole point is that the user sees the blast radius while they can still
   * cancel.
   */
  disconnectImpact(
    accountId: string,
    resources: IntegrationResource[],
    mappings: IntegrationMapping[],
  ): DisconnectImpact {
    const owned = resources.filter((r) => r.accountId === accountId)
    const ownedIds = new Set(owned.map((r) => r.id))
    const impacted = mappings.filter((m) => ownedIds.has(m.resourceId))

    /* Keyed by product *and* client: an organization account can be feeding
       clients in more than one product, and the same workspace id could in
       principle exist in two of them. */
    const seen = new Map<string, AffectedClient>()
    impacted.forEach((mapping) => {
      seen.set(`${mapping.osId}:${mapping.workspaceId}`, {
        osId: mapping.osId,
        workspaceId: mapping.workspaceId,
      })
    })
    const affected = [...seen.values()]

    return {
      resourceCount: owned.length,
      mappedResourceCount: impacted.length,
      affected,
      affectedOSIds: [...new Set(affected.map((a) => a.osId))],
    }
  },

  /** POST /api/v1/nango/disconnect, or Google token revocation. */
  async disconnectAccount(accountId: string): Promise<void> {
    await latency(520)
    void accountId
  },

  /** POST /api/v1/connectors/sync/{id} */
  async syncAccount(accountId: string): Promise<{ syncedAt: string }> {
    await latency(1_300)
    void accountId
    return { syncedAt: new Date().toISOString() }
  },

  /** Re-authorize an expired or revoked account, keeping its id and mappings. */
  async reconnectAccount(account: IntegrationAccount): Promise<IntegrationAccount> {
    await latency(1_100)
    return {
      ...account,
      status: 'connected',
      error: undefined,
      connectedAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
    }
  },

  describeProvider(provider: string): string {
    return providerName(provider)
  },
}
