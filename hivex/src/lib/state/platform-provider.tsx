'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { OS_ORDER } from '@/platform/config/os-registry'
import type {
  BillingPeriod,
  IntegrationConnection,
  Organization,
  OrgMember,
  OrgRole,
  OSActivationStatus,
  OSId,
  OSSubscription,
  PlanId,
  RecentEntry,
  TeamSize,
  Workspace,
} from '@/platform/types'
import {
  DEMO_MEMBERS,
  DEMO_ORGANIZATION,
  DEMO_SUBSCRIPTIONS,
  DEMO_USER,
} from '@/lib/mock/data/organization'
import { DEMO_WORKSPACES } from '@/lib/mock/data/workspaces'
import { SEEDED_CONNECTIONS } from '@/lib/mock/services/integrationService'
import { STORAGE_KEYS, clearAllPlatformStorage, readStorage, writeStorage } from '@/lib/utils/storage'
import {
  OS_WORKSPACE_SOURCES,
  type WorkspaceLoadStatus,
} from '@/os/workspace-sources'

import { useIdentity } from './identity-provider'

/**
 * Platform state — organization, membership, plan, connections and the
 * lightweight per-user preferences (recents, pins).
 *
 * Scope discipline: this provider holds *account* state only. UI state lives in
 * components, OS data lives in the mock services, and assistant state has its
 * own provider. Anything that a real backend would own is reachable from here
 * and nowhere else, so replacing the mock services touches one layer.
 */

interface PersistedState {
  organization: Organization | null
  /** One entry per product the organization has started adding. */
  subscriptions: Partial<Record<OSId, OSSubscription>>
  connections: IntegrationConnection[]
  recents: RecentEntry[]
  favorites: OSId[]
  viewAsRole: OrgRole | null
}

const DEFAULT_STATE: PersistedState = {
  organization: null,
  subscriptions: {},
  connections: [],
  recents: [],
  favorites: [],
  viewAsRole: null,
}

interface PlatformValue extends PersistedState {
  /** False until localStorage has been read — route guards must wait for this. */
  hydrated: boolean
  member: OrgMember
  members: OrgMember[]
  workspaces: Record<OSId, Workspace[]>
  /** Load state for products whose workspaces come from a service. */
  workspaceStatus: Partial<Record<OSId, WorkspaceLoadStatus>>
  workspaceError: Partial<Record<OSId, string>>
  reloadWorkspaces: (osId: OSId) => Promise<void>

  setOrganization: (org: Organization) => void

  /* The product activation funnel. Each call advances one product one stage. */
  selectOS: (osId: OSId) => void
  choosePlan: (
    osId: OSId,
    planId: PlanId,
    period: BillingPeriod,
    teamSize?: TeamSize,
  ) => void
  completePayment: (osId: OSId) => void
  completeSetup: (osId: OSId) => void
  changePlan: (osId: OSId, planId: PlanId, period: BillingPeriod) => void
  removeOS: (osId: OSId) => void
  subscriptionFor: (osId: OSId) => OSSubscription | undefined
  activationStatus: (osId: OSId) => OSActivationStatus
  activeOS: OSId[]

  upsertConnection: (connection: IntegrationConnection) => void
  removeConnection: (integrationId: string) => void
  connectionFor: (integrationId: string) => IntegrationConnection | undefined

  visit: (osId: OSId, workspaceId?: string) => void
  toggleFavorite: (osId: OSId) => void
  isFavorite: (osId: OSId) => boolean

  setViewAsRole: (role: OrgRole | null) => void
  /** Loads the seeded TruPerformance organization and skips onboarding. */
  loadSampleOrganization: () => void
  resetDemo: () => void
}

const PlatformContext = createContext<PlatformValue | null>(null)

const MAX_RECENTS = 8

export function PlatformProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)

  /**
   * Workspaces start from the fixtures and are replaced per-product by any
   * loader registered in OS_WORKSPACE_SOURCES. HR OS begins empty rather than
   * showing fixture teams that its service knows nothing about.
   */
  const [workspaces, setWorkspaces] = useState<Record<OSId, Workspace[]>>(() => ({
    ...DEMO_WORKSPACES,
    ...Object.fromEntries(Object.keys(OS_WORKSPACE_SOURCES).map((osId) => [osId, []])),
  }) as Record<OSId, Workspace[]>)
  const [workspaceStatus, setWorkspaceStatus] = useState<Partial<Record<OSId, WorkspaceLoadStatus>>>(
    () => Object.fromEntries(Object.keys(OS_WORKSPACE_SOURCES).map((osId) => [osId, 'idle'])),
  )
  const [workspaceError, setWorkspaceError] = useState<Partial<Record<OSId, string>>>({})

  const reloadWorkspaces = useCallback(async (osId: OSId) => {
    const source = OS_WORKSPACE_SOURCES[osId]
    if (!source) return
    setWorkspaceStatus((prev) => ({ ...prev, [osId]: 'loading' }))
    try {
      const loaded = await source.load()
      setWorkspaces((prev) => ({ ...prev, [osId]: loaded }))
      setWorkspaceStatus((prev) => ({ ...prev, [osId]: 'ready' }))
      setWorkspaceError((prev) => ({ ...prev, [osId]: undefined }))
    } catch (error) {
      setWorkspaceStatus((prev) => ({ ...prev, [osId]: 'error' }))
      setWorkspaceError((prev) => ({
        ...prev,
        [osId]: error instanceof Error ? error.message : 'Could not load workspaces.',
      }))
    }
  }, [])

  /* Hydrate after mount so server and client first renders match. */
  useEffect(() => {
    setState({
      organization: readStorage<Organization | null>(STORAGE_KEYS.organization, null),
      subscriptions: readStorage<Partial<Record<OSId, OSSubscription>>>(
        STORAGE_KEYS.subscriptions,
        {},
      ),
      connections: readStorage<IntegrationConnection[]>(STORAGE_KEYS.connections, []),
      recents: readStorage<RecentEntry[]>(STORAGE_KEYS.recents, []),
      favorites: readStorage<OSId[]>(STORAGE_KEYS.favorites, []),
      viewAsRole: readStorage<OrgRole | null>(STORAGE_KEYS.identity, null),
    })
    setHydrated(true)
  }, [])

  /* Load remote workspaces once there is an organization to load them for. */
  useEffect(() => {
    if (!hydrated || !state.organization) return
    ;(Object.keys(OS_WORKSPACE_SOURCES) as OSId[]).forEach((osId) => {
      void reloadWorkspaces(osId)
    })
  }, [hydrated, state.organization, reloadWorkspaces])

  const persist = useCallback((next: Partial<PersistedState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next }
      if ('organization' in next) writeStorage(STORAGE_KEYS.organization, merged.organization)
      if ('subscriptions' in next) writeStorage(STORAGE_KEYS.subscriptions, merged.subscriptions)
      if ('connections' in next) writeStorage(STORAGE_KEYS.connections, merged.connections)
      if ('recents' in next) writeStorage(STORAGE_KEYS.recents, merged.recents)
      if ('favorites' in next) writeStorage(STORAGE_KEYS.favorites, merged.favorites)
      if ('viewAsRole' in next) writeStorage(STORAGE_KEYS.identity, merged.viewAsRole)
      return merged
    })
  }, [])

  const setOrganization = useCallback(
    (org: Organization) => persist({ organization: org }),
    [persist],
  )

  /**
   * Funnel transitions.
   *
   * All five write through one helper so a stage can never be skipped by a
   * caller forgetting to set a field — the status is derived from the
   * transition, not passed in by the screen.
   */
  const patchSubscription = useCallback(
    (osId: OSId, patch: (current: OSSubscription | undefined) => OSSubscription | undefined) => {
      setState((prev) => {
        const next = patch(prev.subscriptions[osId])
        const subscriptions = { ...prev.subscriptions }
        if (next) subscriptions[osId] = next
        else delete subscriptions[osId]
        writeStorage(STORAGE_KEYS.subscriptions, subscriptions)
        return { ...prev, subscriptions }
      })
    },
    [],
  )

  const selectOS = useCallback(
    (osId: OSId) =>
      patchSubscription(osId, (current) =>
        current && current.status !== 'discoverable'
          ? current
          : {
              osId,
              planId: 'gold',
              billingPeriod: 'monthly',
              status: 'selected',
              selectedAt: new Date().toISOString(),
            },
      ),
    [patchSubscription],
  )

  const choosePlan = useCallback(
    (osId: OSId, planId: PlanId, billingPeriod: BillingPeriod, teamSize?: TeamSize) =>
      patchSubscription(osId, (current) => ({
        osId,
        selectedAt: current?.selectedAt ?? new Date().toISOString(),
        ...current,
        planId,
        billingPeriod,
        teamSize: teamSize ?? current?.teamSize,
        // An already-active product changing tier stays active; a new one moves
        // on to checkout.
        status: current?.status === 'active' ? 'active' : 'payment_required',
      })),
    [patchSubscription],
  )

  const completePayment = useCallback(
    (osId: OSId) =>
      patchSubscription(osId, (current) =>
        current
          ? { ...current, status: 'setup_required', purchasedAt: new Date().toISOString() }
          : current,
      ),
    [patchSubscription],
  )

  const completeSetup = useCallback(
    (osId: OSId) =>
      patchSubscription(osId, (current) =>
        current
          ? { ...current, status: 'active', setupCompletedAt: new Date().toISOString() }
          : current,
      ),
    [patchSubscription],
  )

  const changePlan = useCallback(
    (osId: OSId, planId: PlanId, billingPeriod: BillingPeriod) =>
      patchSubscription(osId, (current) =>
        current ? { ...current, planId, billingPeriod } : current,
      ),
    [patchSubscription],
  )

  const removeOS = useCallback(
    (osId: OSId) => patchSubscription(osId, () => undefined),
    [patchSubscription],
  )

  const upsertConnection = useCallback((connection: IntegrationConnection) => {
    setState((prev) => {
      const rest = prev.connections.filter((c) => c.integrationId !== connection.integrationId)
      const connections = [...rest, connection]
      writeStorage(STORAGE_KEYS.connections, connections)
      return { ...prev, connections }
    })
  }, [])

  const removeConnection = useCallback((integrationId: string) => {
    setState((prev) => {
      const connections = prev.connections.filter((c) => c.integrationId !== integrationId)
      writeStorage(STORAGE_KEYS.connections, connections)
      return { ...prev, connections }
    })
  }, [])

  const visit = useCallback((osId: OSId, workspaceId?: string) => {
    setState((prev) => {
      const filtered = prev.recents.filter(
        (r) => !(r.osId === osId && r.workspaceId === workspaceId),
      )
      const recents = [{ osId, workspaceId, at: new Date().toISOString() }, ...filtered].slice(
        0,
        MAX_RECENTS,
      )
      writeStorage(STORAGE_KEYS.recents, recents)
      return { ...prev, recents }
    })
  }, [])

  const toggleFavorite = useCallback((osId: OSId) => {
    setState((prev) => {
      const favorites = prev.favorites.includes(osId)
        ? prev.favorites.filter((f) => f !== osId)
        : [...prev.favorites, osId]
      writeStorage(STORAGE_KEYS.favorites, favorites)
      return { ...prev, favorites }
    })
  }, [])

  const setViewAsRole = useCallback(
    (role: OrgRole | null) => persist({ viewAsRole: role }),
    [persist],
  )

  const loadSampleOrganization = useCallback(() => {
    writeStorage(STORAGE_KEYS.organization, DEMO_ORGANIZATION)
    writeStorage(STORAGE_KEYS.subscriptions, DEMO_SUBSCRIPTIONS)
    writeStorage(STORAGE_KEYS.connections, SEEDED_CONNECTIONS)
    setState((prev) => ({
      ...prev,
      organization: DEMO_ORGANIZATION,
      subscriptions: DEMO_SUBSCRIPTIONS,
      connections: SEEDED_CONNECTIONS,
    }))
  }, [])

  const resetDemo = useCallback(() => {
    clearAllPlatformStorage()
    setState(DEFAULT_STATE)
  }, [])

  /**
   * The current membership. Role can be previewed as another role — a demo
   * affordance that also proves the access layer is genuinely centralised:
   * changing one value re-gates the entire application.
   */
  const member = useMemo<OrgMember>(() => {
    const base = DEMO_MEMBERS.find((m) => m.id === DEMO_USER.id) ?? DEMO_MEMBERS[0]
    const role = state.viewAsRole ?? base.role
    const template = state.viewAsRole
      ? (DEMO_MEMBERS.find((m) => m.role === state.viewAsRole) ?? base)
      : base
    return {
      ...template,
      id: base.id,
      role,
      status: 'approved',
      user: {
        ...identity.user,
        designation: template.user.designation ?? identity.user.designation,
      },
    }
  }, [state.viewAsRole, identity.user])

  const organization = state.organization

  const subscriptionFor = useCallback(
    (osId: OSId) => state.subscriptions[osId],
    [state.subscriptions],
  )

  const activationStatus = useCallback(
    (osId: OSId): OSActivationStatus => state.subscriptions[osId]?.status ?? 'discoverable',
    [state.subscriptions],
  )

  const activeOS = useMemo(
    () =>
      (Object.keys(state.subscriptions) as OSId[]).filter(
        (osId) => state.subscriptions[osId]?.status === 'active',
      ),
    [state.subscriptions],
  )

  const connectionFor = useCallback(
    (integrationId: string) => state.connections.find((c) => c.integrationId === integrationId),
    [state.connections],
  )

  const isFavorite = useCallback((osId: OSId) => state.favorites.includes(osId), [state.favorites])

  const value = useMemo<PlatformValue>(
    () => ({
      ...state,
      hydrated,
      member,
      members: DEMO_MEMBERS,
      workspaces,
      workspaceStatus,
      workspaceError,
      reloadWorkspaces,
      setOrganization,
      selectOS,
      choosePlan,
      completePayment,
      completeSetup,
      changePlan,
      removeOS,
      subscriptionFor,
      activationStatus,
      activeOS,
      upsertConnection,
      removeConnection,
      connectionFor,
      visit,
      toggleFavorite,
      isFavorite,
      setViewAsRole,
      loadSampleOrganization,
      resetDemo,
    }),
    [
      state,
      hydrated,
      member,
      workspaces,
      workspaceStatus,
      workspaceError,
      reloadWorkspaces,
      setOrganization,
      selectOS,
      choosePlan,
      completePayment,
      completeSetup,
      changePlan,
      removeOS,
      subscriptionFor,
      activationStatus,
      activeOS,
      upsertConnection,
      removeConnection,
      connectionFor,
      visit,
      toggleFavorite,
      isFavorite,
      setViewAsRole,
      loadSampleOrganization,
      resetDemo,
    ],
  )

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform(): PlatformValue {
  const ctx = useContext(PlatformContext)
  if (!ctx) throw new Error('usePlatform must be used inside <PlatformProvider>')
  return ctx
}

/** Convenience: every OS id in launcher order. */
export const ALL_OS_IDS = OS_ORDER
