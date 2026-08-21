import type { IntegrationConnection, IntegrationResource } from '@/platform/types'
import { resourcesFor } from '@/platform/config/integrations'
import { daysAgo, hoursAgo, latency } from '../seed'

/**
 * Mock integration service.
 *
 * The two real pipelines it stands in for:
 *   - Google:  GET /auth/google/start -> /auth/google/callback ->
 *              GET /auth/google/discovery -> POST /auth/workspace/map
 *   - Nango:   POST /api/v1/nango/connect-session -> Connect UI ->
 *              POST /api/v1/nango/finalize-connection
 *
 * The step sequence below (authorize -> discover -> select -> confirm) is the
 * same in both, which is why the UI can drive either with one component.
 */

/** Connections a returning demo organization already has. */
export const SEEDED_CONNECTIONS: IntegrationConnection[] = [
  {
    integrationId: 'ga4',
    status: 'connected',
    connectedAt: daysAgo(388),
    connectedBy: 'Alex Mercer',
    accountLabel: 'alex.mercer@truperformance.us',
    selectedResources: resourcesFor('ga4').slice(0, 4),
    lastSyncAt: hoursAgo(1),
  },
  {
    integrationId: 'gsc',
    status: 'connected',
    connectedAt: daysAgo(388),
    connectedBy: 'Alex Mercer',
    accountLabel: 'alex.mercer@truperformance.us',
    selectedResources: resourcesFor('gsc').slice(0, 4),
    lastSyncAt: hoursAgo(1),
  },
  {
    integrationId: 'google-ads',
    status: 'connected',
    connectedAt: daysAgo(360),
    connectedBy: 'Priya Raghunathan',
    accountLabel: 'ads@truperformance.us',
    selectedResources: resourcesFor('google-ads').slice(0, 3),
    lastSyncAt: hoursAgo(2),
  },
  {
    integrationId: 'gbp',
    status: 'reconnect_required',
    connectedAt: daysAgo(210),
    connectedBy: 'Priya Raghunathan',
    accountLabel: 'ads@truperformance.us',
    selectedResources: resourcesFor('gbp').slice(0, 2),
    lastSyncAt: daysAgo(9),
    error: 'The refresh token was revoked by the Google account owner.',
  },
  {
    integrationId: 'slack',
    status: 'error',
    connectedAt: daysAgo(120),
    connectedBy: 'Dmitri Volkov',
    accountLabel: 'TruPerformance workspace',
    selectedResources: resourcesFor('slack').slice(0, 2),
    lastSyncAt: daysAgo(3),
    error: 'invalid_auth — the Slack workspace token was rotated.',
  },
  {
    integrationId: 'semrush',
    status: 'connected',
    connectedAt: daysAgo(64),
    connectedBy: 'Nadia Okonkwo',
    accountLabel: 'API key ••••7F2C',
    selectedResources: [],
    lastSyncAt: hoursAgo(14),
  },
]

export type ConnectStep = 'authorize' | 'discover' | 'select' | 'confirm'

export const integrationService = {
  async listConnections(): Promise<IntegrationConnection[]> {
    await latency(200)
    return SEEDED_CONNECTIONS
  },

  /**
   * Opens the provider's consent screen. In production this is a popup to the
   * Google OAuth URL or the Nango Connect UI; here it is a timed simulation so
   * the connecting state is real rather than instantaneous.
   */
  async authorize(integrationId: string): Promise<{ accountLabel: string }> {
    await latency(1_100)
    if (integrationId === 'wappalyzer') {
      throw new Error(
        'Provider slug could not be resolved. Confirm the Nango integration id on the dashboard before connecting.',
      )
    }
    return { accountLabel: 'alex.mercer@truperformance.us' }
  },

  /** GET /auth/google/discovery, or the Nango proxy list-targets call. */
  async discoverResources(integrationId: string): Promise<IntegrationResource[]> {
    await latency(850)
    return resourcesFor(integrationId)
  },

  /** POST /auth/workspace/map or POST /api/v1/nango/finalize-connection */
  async finalize(
    integrationId: string,
    selected: IntegrationResource[],
    accountLabel: string,
  ): Promise<IntegrationConnection> {
    await latency(650)
    return {
      integrationId,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      connectedBy: 'Alex Mercer',
      accountLabel,
      selectedResources: selected,
      lastSyncAt: new Date().toISOString(),
    }
  },

  /** POST /api/v1/nango/disconnect */
  async disconnect(integrationId: string): Promise<void> {
    await latency(420)
    void integrationId
  },

  /** POST /api/v1/connectors/sync/{workspace_id} */
  async sync(integrationId: string): Promise<{ syncedAt: string }> {
    await latency(1_400)
    void integrationId
    return { syncedAt: new Date().toISOString() }
  },
}
