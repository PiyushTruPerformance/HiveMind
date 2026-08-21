import type { ActivityEvent, OrgMember, Organization, OSId, Workspace } from '@/platform/types'
import { DEMO_ACTIVITY } from '../data/activity'
import { DEMO_MEMBERS, DEMO_ORGANIZATION } from '../data/organization'
import { DEMO_WORKSPACES, workspacesForOS } from '../data/workspaces'
import { initialsOf } from '@/lib/utils/format'
import { latency } from '../seed'

/**
 * Mock platform service.
 *
 * Every function here is async and returns a domain type from
 * src/platform/types. That is deliberate: the real implementation swaps the
 * body for a `fetchWithAuth('/api/v1/...')` call and no caller changes.
 *
 * Reporting OS endpoint equivalents are noted per function so the mapping is
 * unambiguous when the backend is wired up.
 */

export interface CreateOrganizationInput {
  name: string
  domain: string
  industry: string
  size: string
  accent: string
  logoUrl?: string
}

export const platformService = {
  /** GET /api/v1/users/me → company */
  async getOrganization(): Promise<Organization> {
    await latency(180)
    return DEMO_ORGANIZATION
  },

  /** POST /api/v1/companies (created by the Clerk organization.created webhook) */
  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    await latency(700)
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const monogram = initialsOf(input.name)

    return {
      id: `org_${slug || 'workspace'}`,
      name: input.name,
      slug: slug || 'workspace',
      domain: input.domain,
      industry: input.industry,
      size: input.size,
      logoUrl: input.logoUrl,
      monogram,
      accent: input.accent,
      createdAt: new Date().toISOString(),
    }
  },

  /** GET /api/v1/users/ */
  async listMembers(): Promise<OrgMember[]> {
    await latency(220)
    return DEMO_MEMBERS
  },

  /** GET /api/v1/company-workspaces/ filtered by OS */
  async listWorkspaces(osId: OSId): Promise<Workspace[]> {
    await latency(200)
    return workspacesForOS(osId)
  },

  async listAllWorkspaces(): Promise<Record<OSId, Workspace[]>> {
    await latency(240)
    return DEMO_WORKSPACES
  },

  /** POST /api/v1/company-workspaces/ */
  async createWorkspace(osId: OSId, name: string): Promise<Workspace> {
    await latency(520)
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return {
      id: `ws_${slug}_${Math.abs(hash(slug))}`,
      osId,
      organizationId: DEMO_ORGANIZATION.id,
      name,
      slug,
      monogram: initialsOf(name),
      accent: '215 16% 42%',
      health: 'healthy',
      healthScore: 100,
      memberCount: 1,
      connectedIntegrations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: [],
    }
  },

  /** GET /api/v1/notifications + recent audit rows */
  async listActivity(osId?: OSId): Promise<ActivityEvent[]> {
    await latency(200)
    return osId ? DEMO_ACTIVITY.filter((a) => a.osId === osId) : DEMO_ACTIVITY
  },
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i += 1) h = (h << 5) - h + value.charCodeAt(i)
  return h
}
