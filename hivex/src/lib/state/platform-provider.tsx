'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { osCanUseServices, serviceIdsForOS } from '@/platform/config/integrations'
import { OS_ORDER } from '@/platform/config/os-registry'
import type {
  BillingPeriod,
  ConnectionScope,
  DisconnectImpact,
  IntegrationAccount,
  IntegrationMapping,
  IntegrationResource,
  Organization,
  OrgMember,
  OrgRole,
  OSActivationStatus,
  OSId,
  ConnectionStatus,
  OSSubscription,
  PlanId,
  RecentEntry,
  ResolvedResource,
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
import {
  SEEDED_ACCOUNTS,
  SEEDED_MAPPINGS,
  SEEDED_RESOURCES,
  integrationService,
} from '@/lib/mock/services/integrationService'
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
  /* Integrations, in three normalised tables rather than one nested blob. */
  accounts: IntegrationAccount[]
  resources: IntegrationResource[]
  mappings: IntegrationMapping[]
  recents: RecentEntry[]
  favorites: OSId[]
  viewAsRole: OrgRole | null
}

const DEFAULT_STATE: PersistedState = {
  organization: null,
  subscriptions: {},
  accounts: [],
  resources: [],
  mappings: [],
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

  /* --- integration accounts ------------------------------------------- */
  upsertAccount: (account: IntegrationAccount) => void
  /** Disconnect, keeping client mappings that depend on the account. */
  disconnectAccount: (accountId: string) => void
  /** Forget entirely — account, resources and the mappings pointing at them. */
  removeAccount: (accountId: string) => void
  addResources: (resources: IntegrationResource[]) => void
  /** Mark an account's resources usable again after a successful reconnect. */
  restoreResources: (accountId: string) => void
  /** Accounts owning a product, optionally narrowed to one client. */
  accountsFor: (osId: OSId, workspaceId?: string) => IntegrationAccount[]
  resourcesForAccount: (accountId: string) => IntegrationResource[]
  /** Every resource an OS can use, joined to its account and mapping. */
  resolvedResources: (osId: OSId) => ResolvedResource[]
  /** Resources currently feeding one client. */
  clientResources: (osId: OSId, workspaceId: string) => ResolvedResource[]
  mapResource: (resourceId: string, osId: OSId, workspaceId: string) => Promise<void>
  unmapResource: (resourceId: string, osId: OSId) => Promise<void>
  disconnectImpactFor: (accountId: string) => DisconnectImpact
  /** Accounts granting one service, optionally narrowed to a product. */
  accountsForService: (integrationId: string, osId?: OSId) => IntegrationAccount[]
  /**
   * Health of one integration.
   *
   * Kept because the setup checklist and the catalog browser ask "is GA4
   * connected?" — a question about a *service*, which is now answered by
   * looking at the accounts that grant it rather than by a stored flag.
   */
  serviceStatus: (integrationId: string, osId?: OSId) => ConnectionStatus
  connectScope: (osId: OSId, workspaceId?: string) => ConnectionScope

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

/**
 * Accounts persisted before connections became organization-wide.
 *
 * The old shape pinned every account to one product (`{kind:'os', osId}`). A
 * browser holding that state would otherwise show a returning user zero
 * accounts, so it is widened here and the product it was tied to is kept as
 * provenance.
 */
type StoredAccount = Omit<IntegrationAccount, 'scope' | 'connectedIn'> & {
  scope: ConnectionScope | { kind: 'os'; osId: OSId }
  connectedIn?: OSId
}

function migrateAccounts(stored: StoredAccount[]): IntegrationAccount[] {
  return stored.map((account) => {
    if (account.scope.kind === 'os') {
      return {
        ...account,
        scope: { kind: 'organization' } as const,
        connectedIn: account.connectedIn ?? account.scope.osId,
      }
    }
    return {
      ...account,
      scope: account.scope,
      connectedIn:
        account.connectedIn ??
        (account.scope.kind === 'client' ? account.scope.osId : OS_ORDER[0]),
    }
  })
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE)

  /**
   * Latest state for async actions.
   *
   * Mapping goes through the service before the reducer runs, so the callback
   * must read the resource table at call time rather than close over a render.
   */
  const stateRef = useRef(state)
  stateRef.current = state
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
      accounts: migrateAccounts(readStorage<StoredAccount[]>(STORAGE_KEYS.accounts, [])),
      resources: readStorage<IntegrationResource[]>(STORAGE_KEYS.resources, []),
      mappings: readStorage<IntegrationMapping[]>(STORAGE_KEYS.mappings, []),
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
      if ('accounts' in next) writeStorage(STORAGE_KEYS.accounts, merged.accounts)
      if ('resources' in next) writeStorage(STORAGE_KEYS.resources, merged.resources)
      if ('mappings' in next) writeStorage(STORAGE_KEYS.mappings, merged.mappings)
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

  /* ---------------------------------------------------------------- */
  /* Integrations                                                       */
  /* ---------------------------------------------------------------- */

  const upsertAccount = useCallback((account: IntegrationAccount) => {
    setState((prev) => {
      const rest = prev.accounts.filter((a) => a.id !== account.id)
      const accounts = [...rest, account]
      writeStorage(STORAGE_KEYS.accounts, accounts)
      return { ...prev, accounts }
    })
  }, [])

  const addResources = useCallback((incoming: IntegrationResource[]) => {
    setState((prev) => {
      const known = new Set(prev.resources.map((r) => r.id))
      const resources = [...prev.resources, ...incoming.filter((r) => !known.has(r.id))]
      writeStorage(STORAGE_KEYS.resources, resources)
      return { ...prev, resources }
    })
  }, [])

  /**
   * Hard delete: the account, its resources and any mapping pointing at them.
   *
   * Only correct when there is nothing to preserve — an abandoned authorization,
   * or an account the user has explicitly chosen to forget. Ordinary
   * disconnection goes through `disconnectAccount`.
   */
  const removeAccount = useCallback((accountId: string) => {
    setState((prev) => {
      const ownedIds = new Set(
        prev.resources.filter((r) => r.accountId === accountId).map((r) => r.id),
      )
      const accounts = prev.accounts.filter((a) => a.id !== accountId)
      const resources = prev.resources.filter((r) => r.accountId !== accountId)
      const mappings = prev.mappings.filter((m) => !ownedIds.has(m.resourceId))
      writeStorage(STORAGE_KEYS.accounts, accounts)
      writeStorage(STORAGE_KEYS.resources, resources)
      writeStorage(STORAGE_KEYS.mappings, mappings)
      return { ...prev, accounts, resources, mappings }
    })
  }, [])

  /**
   * Disconnect, keeping every client mapping intact.
   *
   * An account nothing depends on is simply deleted. One that clients rely on
   * is *remembered* in a `disconnected` state with its resources marked
   * unavailable, so the affected client pages say "source unavailable" and
   * reconnecting restores them — rather than the mapping vanishing and the
   * client silently losing a data source nobody can name afterwards.
   */
  const disconnectAccount = useCallback((accountId: string) => {
    setState((prev) => {
      const ownedIds = new Set(
        prev.resources.filter((r) => r.accountId === accountId).map((r) => r.id),
      )
      const depended = prev.mappings.some((m) => ownedIds.has(m.resourceId))

      if (!depended) {
        const accounts = prev.accounts.filter((a) => a.id !== accountId)
        const resources = prev.resources.filter((r) => r.accountId !== accountId)
        writeStorage(STORAGE_KEYS.accounts, accounts)
        writeStorage(STORAGE_KEYS.resources, resources)
        return { ...prev, accounts, resources }
      }

      const accounts = prev.accounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              status: 'disconnected' as const,
              error: 'Disconnected here. Client mappings are being kept until you reconnect or remove it.',
            }
          : account,
      )
      const resources = prev.resources.map((resource) =>
        resource.accountId === accountId ? { ...resource, available: false } : resource,
      )
      writeStorage(STORAGE_KEYS.accounts, accounts)
      writeStorage(STORAGE_KEYS.resources, resources)
      return { ...prev, accounts, resources }
    })
  }, [])

  /**
   * Bring a disconnected account's resources back.
   *
   * Reconnection has to undo the availability flag `disconnectAccount` set;
   * rediscovery alone would not, because the resource ids already exist and
   * `addResources` ignores duplicates by design.
   */
  const restoreResources = useCallback((accountId: string) => {
    setState((prev) => {
      const resources = prev.resources.map((resource) =>
        resource.accountId === accountId ? { ...resource, available: true } : resource,
      )
      writeStorage(STORAGE_KEYS.resources, resources)
      return { ...prev, resources }
    })
  }, [])

  const mapResource = useCallback(
    async (resourceId: string, osId: OSId, workspaceId: string) => {
      const resource = stateRef.current.resources.find((r) => r.id === resourceId)
      if (!resource) return
      const mapping = await integrationService.mapResource(resource, osId, workspaceId)
      setState((prev) => {
        // One client per resource *per product*; re-mapping replaces that one.
        const rest = prev.mappings.filter(
          (m) => !(m.resourceId === resourceId && m.osId === osId),
        )
        const mappings = [...rest, mapping]
        writeStorage(STORAGE_KEYS.mappings, mappings)
        return { ...prev, mappings }
      })
    },
    [],
  )

  const unmapResource = useCallback(async (resourceId: string, osId: OSId) => {
    const existing = stateRef.current.mappings.find(
      (m) => m.resourceId === resourceId && m.osId === osId,
    )
    if (existing) await integrationService.unmapResource(existing.id)
    setState((prev) => {
      const mappings = prev.mappings.filter(
        (m) => !(m.resourceId === resourceId && m.osId === osId),
      )
      writeStorage(STORAGE_KEYS.mappings, mappings)
      return { ...prev, mappings }
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
    writeStorage(STORAGE_KEYS.accounts, SEEDED_ACCOUNTS)
    writeStorage(STORAGE_KEYS.resources, SEEDED_RESOURCES)
    writeStorage(STORAGE_KEYS.mappings, SEEDED_MAPPINGS)
    setState((prev) => ({
      ...prev,
      organization: DEMO_ORGANIZATION,
      subscriptions: DEMO_SUBSCRIPTIONS,
      accounts: SEEDED_ACCOUNTS,
      resources: SEEDED_RESOURCES,
      mappings: SEEDED_MAPPINGS,
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

  /**
   * `Workspace.connectedIntegrations` is derived here and nowhere else.
   *
   * Storing it on the fixture would mean the same fact lived in two places —
   * the mapping table and the workspace row — and they would drift the first
   * time someone re-mapped a property.
   */
  const workspacesWithSources = useMemo(() => {
    const accountsById = new Map(state.accounts.map((a) => [a.id, a]))
    const resourcesById = new Map(state.resources.map((r) => [r.id, r]))
    const byWorkspace = new Map<string, Set<string>>()

    state.mappings.forEach((mapping) => {
      const resource = resourcesById.get(mapping.resourceId)
      if (!resource || !accountsById.has(resource.accountId)) return
      const key = `${mapping.osId}:${mapping.workspaceId}`
      const set = byWorkspace.get(key) ?? new Set<string>()
      set.add(resource.service)
      byWorkspace.set(key, set)
    })

    const next = {} as Record<OSId, Workspace[]>
    ;(Object.keys(workspaces) as OSId[]).forEach((osId) => {
      next[osId] = (workspaces[osId] ?? []).map((workspace) => {
        const derived = byWorkspace.get(`${osId}:${workspace.id}`)
        // Products not yet on the mapping model keep whatever they declared.
        if (!derived && workspace.connectedIntegrations.length === 0) return workspace
        if (!derived) return workspace
        return { ...workspace, connectedIntegrations: [...derived] }
      })
    })
    return next
  }, [workspaces, state.accounts, state.resources, state.mappings])

  const activeOS = useMemo(
    () =>
      (Object.keys(state.subscriptions) as OSId[]).filter(
        (osId) => state.subscriptions[osId]?.status === 'active',
      ),
    [state.subscriptions],
  )

  /**
   * Accounts a product can see.
   *
   * An organization account is visible to any product that uses at least one of
   * the services it grants — so subscribing to SEO OS surfaces the Google login
   * added in Reporting OS with no second sign-in, and a Gmail account added in
   * HR OS shows up in both. A client account stays inside its own product.
   */
  const accountsFor = useCallback(
    (osId: OSId, workspaceId?: string) =>
      state.accounts.filter((account) => {
        if (account.scope.kind === 'organization') {
          return osCanUseServices(osId, account.services)
        }
        if (account.scope.osId !== osId) return false
        return workspaceId ? account.scope.workspaceId === workspaceId : true
      }),
    [state.accounts],
  )

  const resourcesForAccount = useCallback(
    (accountId: string) => state.resources.filter((r) => r.accountId === accountId),
    [state.resources],
  )

  const resolvedResources = useCallback(
    (osId: OSId): ResolvedResource[] => {
      const visible = new Map(accountsFor(osId).map((a) => [a.id, a]))
      const usable = serviceIdsForOS(osId)
      /*
       * Keyed by product as well as resource. The same GA4 property can feed a
       * Reporting client and an SEO project at once, and each product must see
       * only its own assignment — otherwise SEO would report the property as
       * "already mapped" to a client that does not exist in SEO.
       */
      const mappingByResource = new Map(
        state.mappings.filter((m) => m.osId === osId).map((m) => [m.resourceId, m]),
      )

      return state.resources.flatMap((resource) => {
        const account = visible.get(resource.accountId)
        /* An account can grant more than a product consumes — a Google login
           gives HR OS nothing but Gmail, so its GA4 properties stay out. */
        if (!account || !usable.has(resource.service)) return []
        const mapping = mappingByResource.get(resource.id)
        return [
          {
            resource,
            account,
            ...(mapping ? { mapping } : {}),
            clientSpecific: account.scope.kind === 'client',
          },
        ]
      })
    },
    [accountsFor, state.resources, state.mappings],
  )

  const clientResources = useCallback(
    (osId: OSId, workspaceId: string) =>
      resolvedResources(osId).filter((entry) => entry.mapping?.workspaceId === workspaceId),
    [resolvedResources],
  )

  const disconnectImpactFor = useCallback(
    (accountId: string) =>
      integrationService.disconnectImpact(accountId, state.resources, state.mappings),
    [state.resources, state.mappings],
  )

  /**
   * A service is connected when at least one healthy account in scope grants
   * it. Asking the accounts rather than storing a per-service flag is what
   * keeps multi-account correct.
   */
  const accountsForService = useCallback(
    (integrationId: string, osId?: OSId) =>
      state.accounts.filter((account) => {
        if (!account.services.includes(integrationId)) return false
        if (!osId) return true
        /* Organization accounts answer for every product; client accounts only
           for the product that owns them. */
        return account.scope.kind === 'organization' || account.scope.osId === osId
      }),
    [state.accounts],
  )

  const serviceStatus = useCallback(
    (integrationId: string, osId?: OSId): ConnectionStatus => {
      const granting = accountsForService(integrationId, osId)
      if (granting.length === 0) return 'not_connected'
      if (granting.some((a) => a.status === 'connected')) return 'connected'
      if (granting.some((a) => a.status === 'connecting')) return 'connecting'
      if (granting.some((a) => a.status === 'discovering')) return 'discovering'
      if (granting.some((a) => a.status === 'reconnect_required')) return 'reconnect_required'
      if (granting.some((a) => a.status === 'expired')) return 'expired'
      return 'error'
    },
    [accountsForService],
  )

  /**
   * What a new connection will belong to.
   *
   * Connecting from a product's own Integrations page still produces an
   * *organization* account — the product is where the user happens to be, not
   * who owns the login. Only a client page produces a client-scoped one.
   */
  const connectScope = useCallback(
    (osId: OSId, workspaceId?: string): ConnectionScope =>
      workspaceId ? { kind: 'client', osId, workspaceId } : { kind: 'organization' },
    [],
  )

  const isFavorite = useCallback((osId: OSId) => state.favorites.includes(osId), [state.favorites])

  const value = useMemo<PlatformValue>(
    () => ({
      ...state,
      hydrated,
      member,
      members: DEMO_MEMBERS,
      workspaces: workspacesWithSources,
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
      upsertAccount,
      disconnectAccount,
      removeAccount,
      addResources,
      restoreResources,
      accountsFor,
      resourcesForAccount,
      resolvedResources,
      clientResources,
      accountsForService,
      mapResource,
      unmapResource,
      disconnectImpactFor,
      serviceStatus,
      connectScope,
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
      workspacesWithSources,
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
      upsertAccount,
      disconnectAccount,
      removeAccount,
      addResources,
      accountsFor,
      resourcesForAccount,
      resolvedResources,
      clientResources,
      accountsForService,
      mapResource,
      unmapResource,
      disconnectImpactFor,
      serviceStatus,
      connectScope,
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
