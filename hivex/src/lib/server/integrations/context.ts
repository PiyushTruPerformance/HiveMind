import 'server-only'

import { verifyToken } from '@clerk/nextjs/server'

import { serverEnv } from './env'
import { HttpError } from './http'
import { db, must } from './supabase'

/**
 * Identity and tenant resolution for every integrations route.
 *
 *   Clerk session JWT (Authorization: Bearer)
 *     → user_profiles row (clerk_id = sub), approved, with a company
 *     → clients this user may see (company + permissions, as Reporting's GET /clients/)
 *     → the data workspace attached to a client (workspaces.connected_to)
 *
 * Nothing here trusts an id from the browser: a client id supplied by a request
 * is only accepted when it is in the caller's visible set, and workspace ids are
 * always looked up from it, never read from the request.
 */

export interface UserProfile {
  id: string
  clerk_id: string
  company_id: string | null
  role: string | null
  status: string | null
  permissions?: {
    global?: { is_super_admin?: boolean }
    clients?: Record<string, unknown>
    workspaces?: Record<string, unknown>
  } | null
  client_ids?: string[] | string | null
  workspace_ids?: string[] | string | null
}

export interface ClientRow {
  id: string
  name: string | null
  key: string
  company_id: string
  initials?: string | null
  created_at?: string | null
}

export interface WorkspaceRow {
  id: string
  name: string
  connected_to: string | null
  created_at: string | null
}

export interface IntegrationContext {
  profile: UserProfile & { company_id: string }
}

async function verifiedClerkId(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Not authenticated')
  try {
    const payload = await verifyToken(header.slice(7).trim(), {
      secretKey: serverEnv.clerkSecretKey(),
      clockSkewInMs: 60_000,
    })
    if (!payload.sub) throw new Error('missing sub')
    return payload.sub
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(401, 'Your session could not be verified. Sign in again.')
  }
}

/** Port of `get_current_user_profile`: approved profile with a company, or 401/403/404. */
export async function requireContext(request: Request): Promise<IntegrationContext> {
  const clerkId = await verifiedClerkId(request)
  const rows = must(
    await db().from('user_profiles').select('*').eq('clerk_id', clerkId).limit(1),
    'Profile lookup',
  ) as UserProfile[]
  const profile = rows[0]
  if (!profile) throw new HttpError(404, 'User profile not found')
  if (profile.status !== 'approved') throw new HttpError(403, 'User is not approved to access company resources')
  if (!profile.company_id) throw new HttpError(403, 'User is not associated with any company')
  return { profile: profile as IntegrationContext['profile'] }
}

function parseIds(value: string[] | string | null | undefined): string[] | null {
  if (value == null) return null
  if (Array.isArray(value)) return value.map(String)
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return null
  }
}

/** Port of Reporting's `GET /clients/` visibility rules (without its admin `all=true` escape hatch). */
export async function visibleClients(ctx: IntegrationContext): Promise<ClientRow[]> {
  const { profile } = ctx
  let query = db().from('client').select('*').eq('company_id', profile.company_id)
  const role = (profile.role ?? '').toLowerCase()
  const permissions = profile.permissions

  if (permissions && typeof permissions === 'object') {
    if (!permissions.global?.is_super_admin) {
      const allowed = Object.keys(permissions.clients ?? {})
      if (allowed.length === 0) return []
      query = query.in('id', allowed)
    }
  } else {
    const clientIds = parseIds(profile.client_ids)
    if (clientIds !== null) {
      if (clientIds.length === 0) return []
      query = query.in('id', clientIds)
    } else if (role !== 'admin' && role !== 'vp') {
      return []
    }
  }

  const clients = must(await query.order('created_at', { ascending: true }), 'Client lookup') as ClientRow[]
  return clients
}

/** A client the caller may use, or 404 — never another company's client. */
export async function requireClient(ctx: IntegrationContext, clientId: string): Promise<ClientRow> {
  const clients = await visibleClients(ctx)
  const client = clients.find((c) => c.id === clientId)
  if (!client) throw new HttpError(404, 'Client not found')
  return client
}

/** Data workspaces for a set of clients, oldest first per client. */
export async function workspacesForClients(clientIds: string[]): Promise<WorkspaceRow[]> {
  if (clientIds.length === 0) return []
  return must(
    await db()
      .from('workspaces')
      .select('id, name, connected_to, created_at')
      .in('connected_to', clientIds)
      .order('created_at', { ascending: true }),
    'Workspace lookup',
  ) as WorkspaceRow[]
}

/** The data workspace behind a client the caller may use. */
export async function requireClientWorkspace(
  ctx: IntegrationContext,
  clientId: string,
): Promise<{ client: ClientRow; workspace: WorkspaceRow }> {
  const client = await requireClient(ctx, clientId)
  const [workspace] = await workspacesForClients([client.id])
  if (!workspace) {
    throw new HttpError(409, `${client.name ?? 'This client'} has no data workspace yet, so it cannot hold integrations.`)
  }
  return { client, workspace }
}

/**
 * The workspace user-scoped tool connections attach to.
 *
 * Nango connections belong to a user inside a workspace. HiveX has no visible
 * workspace, so it uses the first workspace among the caller's visible clients —
 * the same default the Reporting tools page and chat use (`workspaces[0]`).
 */
export async function requireToolWorkspace(ctx: IntegrationContext): Promise<WorkspaceRow> {
  const clients = await visibleClients(ctx)
  const [workspace] = await workspacesForClients(clients.map((c) => c.id))
  if (!workspace) throw new HttpError(409, 'No data workspace is available for your account yet, so tools cannot be connected.')
  return workspace
}
