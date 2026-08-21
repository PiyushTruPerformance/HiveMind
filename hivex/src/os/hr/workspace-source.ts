import type { Workspace } from '@/platform/types'
import { initialsOf, slugify } from '@/lib/utils/format'

import { hrApi } from './api/client'
import { UNASSIGNED_CLIENT_ID, type Job } from './api/types'

/**
 * HR OS workspaces come from the service, not from fixtures.
 *
 * A CV Analyzer *client* is a HiveX *workspace* — the same mapping Reporting OS
 * uses for its clients. Jobs the service left unassigned (`client_id: null`)
 * are collected into one synthetic workspace so they stay reachable instead of
 * disappearing from a client-scoped UI.
 */

/** Deterministic hue per client, so a workspace keeps its colour between loads. */
const HUES = ['272 58% 60%', '212 84% 54%', '162 62% 38%', '340 62% 56%', '28 80% 52%', '215 16% 42%']

function hueFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

function buildWorkspace(id: string, name: string, jobs: Job[], createdAt: string): Workspace {
  const open = jobs.filter((job) => job.status === 'OPEN').length
  const drafts = jobs.filter((job) => job.status === 'DRAFT').length

  /**
   * "Health" for a hiring client is how much of its posted work is actually
   * live. A client whose roles are all closed or still drafts is not broken,
   * but it is not running either — which is exactly what the amber state means
   * everywhere else on the platform.
   */
  const healthScore = jobs.length === 0 ? 0 : Math.round((open / jobs.length) * 100)
  const health: Workspace['health'] =
    healthScore >= 60 ? 'healthy' : healthScore >= 25 ? 'attention' : 'at_risk'

  return {
    id,
    osId: 'hr',
    organizationId: 'org_truperformance',
    name,
    slug: slugify(name) || id,
    monogram: initialsOf(name),
    accent: hueFor(id),
    description:
      jobs.length === 0
        ? 'No roles posted yet.'
        : `${open} open of ${jobs.length} role${jobs.length === 1 ? '' : 's'}${drafts ? ` · ${drafts} draft` : ''}.`,
    health,
    healthScore,
    memberCount: 0,
    connectedIntegrations: [],
    createdAt,
    updatedAt: jobs.reduce<string>(
      (latest, job) => (job.created_at > latest ? job.created_at : latest),
      createdAt,
    ),
    stats: [
      { label: 'Open roles', value: String(open) },
      { label: 'Total roles', value: String(jobs.length) },
    ],
  }
}

export async function loadHRWorkspaces(): Promise<Workspace[]> {
  const [clients, jobs] = await Promise.all([hrApi.listClients(), hrApi.listJobs()])

  const workspaces = clients.map((client) =>
    buildWorkspace(
      client.id,
      client.name,
      jobs.filter((job) => job.client_id === client.id),
      client.created_at,
    ),
  )

  const unassigned = jobs.filter((job) => job.client_id === null)
  if (unassigned.length > 0) {
    workspaces.push(
      buildWorkspace(
        UNASSIGNED_CLIENT_ID,
        'Unassigned',
        unassigned,
        unassigned[unassigned.length - 1]?.created_at ?? new Date().toISOString(),
      ),
    )
  }

  return workspaces
}
