/**
 * Platform-level domain contracts.
 *
 * These types are the seam between the mock service layer and a future real
 * backend: every mock service in src/lib/mock/services returns these shapes, so
 * swapping in FastAPI calls is a change of implementation, not of types.
 */

import type { LucideIcon } from 'lucide-react'

/* -------------------------------------------------------------------------- */
/* Identity & organization                                                     */
/* -------------------------------------------------------------------------- */

export type PlanId = 'free' | 'silver' | 'gold' | 'platinum'

/** Organization-level role. Mirrors Reporting OS roles.ts plus a platform superadmin. */
export type OrgRole =
  | 'superadmin'
  | 'admin'
  | 'vp'
  | 'team_lead'
  | 'team_member'
  | 'client'
  | 'user'

/** Role scoped to an OS or a workspace. */
export type ScopedRole = 'admin' | 'team_lead' | 'editor' | 'analyst' | 'viewer'

/** Lifecycle from Reporting OS section 4.3. */
export type MemberStatus = 'onboarding' | 'waiting' | 'approved'

export interface PlatformUser {
  id: string
  clerkId: string
  name: string
  email: string
  avatarUrl?: string
  designation?: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  domain: string
  industry: string
  size: string
  logoUrl?: string
  /** Two-letter monogram used when no logo is uploaded. */
  monogram: string
  accent: string
  createdAt: string
}

export interface OrgMember {
  id: string
  user: PlatformUser
  role: OrgRole
  status: MemberStatus
  joinedAt: string
  /** OS products this member may open. Empty array = inherits role default. */
  osAccess: OSId[]
  /** Workspace ids this member may open, keyed by OS id. */
  workspaceAccess: Record<string, string[]>
  /** Role held inside a given OS. Falls back to the org role mapping. */
  osRoles: Partial<Record<OSId, ScopedRole>>
}

/* -------------------------------------------------------------------------- */
/* Plans                                                                       */
/* -------------------------------------------------------------------------- */

export type BillingPeriod = 'monthly' | 'yearly'

export interface PlanLimits {
  /** -1 means unlimited. */
  workspacesPerOS: number
  members: number
  integrations: number
  aiMessagesPerMonth: number
  dataRetentionDays: number
  seatsIncluded: number
}

export interface PlanCapabilities {
  universalAssistant: boolean
  crossOSAssistant: boolean
  customAssistantPersonas: boolean
  scheduledReports: boolean
  apiAccess: boolean
  mcpAccess: boolean
  sso: boolean
  auditLog: boolean
  prioritySupport: boolean
}

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /**
   * Baseline price per period. Each OS overrides this in OS_PRICING, because a
   * subscription is bought per product, not per organization.
   */
  price: Record<BillingPeriod, number>
  currency: string
  limits: PlanLimits
  capabilities: PlanCapabilities
  /** Bullet list shown on the plan card. */
  highlights: string[]
  recommended?: boolean
  order: number
}

/* -------------------------------------------------------------------------- */
/* OS products                                                                 */
/* -------------------------------------------------------------------------- */

export type OSId = 'reporting' | 'seo' | 'hr' | 'finance'

export type OSStatus = 'live' | 'beta' | 'coming_soon'

/**
 * Where an organization stands with one product.
 *
 * The funnel is linear — discoverable → selected → payment_required →
 * setup_required → active — and each stage maps to exactly one route, so the
 * router can always resume someone at the step they abandoned.
 */
export type OSActivationStatus =
  | 'discoverable'
  | 'selected'
  | 'payment_required'
  | 'setup_required'
  | 'active'

export interface OSSubscription {
  osId: OSId
  planId: PlanId
  billingPeriod: BillingPeriod
  status: OSActivationStatus
  selectedAt: string
  purchasedAt?: string
  setupCompletedAt?: string
  /** Team size answered on the pricing step; drives the recommendation only. */
  teamSize?: TeamSize
}

export type TeamSize = '1-5' | '6-20' | '21-100' | '100+'

/**
 * Long-form product content for the OS detail page.
 *
 * Kept in the registry rather than in the page so a new product ships its own
 * marketing copy alongside its navigation, and the detail page stays generic.
 */
export interface OSMarketing {
  headline: string
  subheadline: string
  /** Problems the product solves, in the reader's words. */
  problems: string[]
  audience: string[]
  capabilities: { title: string; description: string; icon: LucideIcon }[]
  workflows: { title: string; steps: string[] }[]
  outcomes: { label: string; value: string; caption: string }[]
}

export interface OSNavItem {
  /** URL segment under /app/os/{osId}/w/{workspaceId}/{id}. Empty string = workspace home. */
  id: string
  label: string
  icon: LucideIcon
  description?: string
  /** Minimum scoped role required. Enforced centrally by the access layer. */
  minRole?: ScopedRole
  group?: string
  badge?: string
}

/** Navigation that lives above workspaces, at OS level. */
export interface OSSectionItem {
  id: string
  label: string
  icon: LucideIcon
}

export interface OSProduct {
  id: OSId
  name: string
  shortName: string
  description: string
  /** One-line value proposition shown on the launcher card. */
  tagline: string
  icon: LucideIcon
  /** Product hue in HSL triplet form. Used for the OS tile only. */
  hue: string
  status: OSStatus
  /** Integration ids this OS reads from. */
  requiredIntegrations: string[]
  optionalIntegrations: string[]
  supportsWorkspaces: boolean
  /** What a workspace is called inside this OS ("Client", "Project", ...). */
  workspaceNoun: { singular: string; plural: string }
  navigation: OSNavItem[]
  /** OS-level (workspace-independent) sections. */
  sections: OSSectionItem[]
  /** Long-form content for the product detail page. */
  marketing: OSMarketing
  assistant: {
    placeholder: string
    suggestions: string[]
    /** Data sources the assistant declares when scoped to this OS. */
    dataSources: string[]
  }
}

/* -------------------------------------------------------------------------- */
/* Workspaces                                                                  */
/* -------------------------------------------------------------------------- */

export type WorkspaceHealth = 'healthy' | 'attention' | 'at_risk'

export interface WorkspaceStat {
  label: string
  value: string
  delta?: number
}

export interface Workspace {
  id: string
  osId: OSId
  organizationId: string
  name: string
  slug: string
  /** Short label rendered in the switcher avatar. */
  monogram: string
  accent: string
  description?: string
  health: WorkspaceHealth
  healthScore: number
  memberCount: number
  /**
   * Integration ids feeding this client.
   *
   * Derived in the platform provider from resource mappings — never authored on
   * a fixture, because the account that owns a resource is the single source of
   * truth for what a client is connected to.
   */
  connectedIntegrations: string[]
  createdAt: string
  updatedAt: string
  /** Per-OS summary metrics rendered on workspace cards. */
  stats: WorkspaceStat[]
}

export interface RecentEntry {
  osId: OSId
  workspaceId?: string
  at: string
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

export type IntegrationAuthType = 'google_oauth' | 'nango_oauth' | 'api_key'

export type IntegrationCategory =
  | 'analytics'
  | 'advertising'
  | 'search'
  | 'communication'
  | 'productivity'
  | 'crm'
  | 'design'
  | 'seo'
  | 'bi'
  | 'meetings'
  | 'storage'

export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'discovering'
  | 'connected'
  /**
   * Deliberately disconnected, but still remembered because clients depend on
   * it. Keeping the row is what lets "reconnect and the data comes back" be
   * true — a hard delete would take the client mappings with it.
   */
  | 'disconnected'
  | 'error'
  | 'expired'
  | 'reconnect_required'

export interface IntegrationDefinition {
  id: string
  name: string
  /** Nango integration slug, or google-native for the first-party pipeline. */
  providerSlug: string
  category: IntegrationCategory
  authType: IntegrationAuthType
  description: string
  /** OS products that consume this integration. */
  usedBy: OSId[]
  /** Rollout phase from the connector expansion roadmap. 0 = already live. */
  phase: number
  /** false when the roadmap flags the provider slug as unconfirmed. */
  confirmed: boolean
  brandColor: string
  monogram: string
  /** Scopes/resources requested - shown in the authorize step. */
  scopes: string[]
  /** Whether connecting yields selectable resources (properties, accounts...). */
  hasResourceSelection: boolean
  docsNote?: string
}

/* -------------------------------------------------------------------------- */
/* Integration model: account -> resource -> mapping                           */
/* -------------------------------------------------------------------------- */

/**
 * Three levels, deliberately separate.
 *
 *   IntegrationAccount   WHO authorised — one Google login, one Slack workspace.
 *                        A single Google account grants several *services*
 *                        (GA4, Search Console, Ads, Business Profile), so an
 *                        account is NOT the same thing as an integration.
 *   IntegrationResource  WHAT that account exposes — a GA4 property, a verified
 *                        site, an Ads customer, a Business Profile location.
 *   IntegrationMapping   WHICH client consumes a resource.
 *
 * Collapsing any two of these is what made the previous model unable to express
 * "one agency Google login serving twelve clients".
 */

/** Groups the integrations that a single authorization grants together. */
export type IntegrationProviderKey = string

/**
 * Who owns a connection.
 *
 * `organization` connections belong to the account, not to a product. Signing
 * into Google is something a person does once for the organization, so adding a
 * second product must never ask for the same login again — Reporting OS and SEO
 * OS both read Search Console from the one authorization.
 *
 * Which product can *use* an organization account is not stored here: it falls
 * out of the services the account grants and the integrations each product
 * declares, so a new product picks up the right accounts with no extra wiring.
 *
 * `client` connections belong to one client inside one product — used when a
 * client insists on their own Google login rather than the agency's. Those stay
 * narrow on purpose; a client's credentials are not an organization asset.
 */
export type ConnectionScope =
  | { kind: 'organization' }
  | { kind: 'client'; osId: OSId; workspaceId: string }

export interface IntegrationAccount {
  id: string
  /** Provider family: 'google' for the Google pipeline, else the integration id. */
  provider: IntegrationProviderKey
  scope: ConnectionScope
  /**
   * The product the user was in when they authorized.
   *
   * Provenance only — it never limits who can use the account. It exists so the
   * UI can say "added in Reporting OS" when the same login turns up in SEO OS,
   * which is the difference between a reused account and a mystery one.
   */
  connectedIn: OSId
  /** Human identity of the authorization — usually an email. */
  label: string
  /** Provider-side account identifier, kept for the real backend. */
  externalAccountId: string
  status: ConnectionStatus
  /** Integration ids this one authorization grants. */
  services: string[]
  grantedScopes: string[]
  connectedAt: string
  connectedBy: string
  lastSyncAt?: string
  error?: string
}

export type ResourceKind = 'property' | 'site' | 'account' | 'location' | 'channel' | 'folder'

export interface IntegrationResource {
  id: string
  accountId: string
  /** Integration id this resource belongs to — ga4, gsc, google-ads, gbp… */
  service: string
  /** Provider-side id: GA4 property id, sc-domain URL, Ads customer id. */
  externalId: string
  name: string
  subtitle: string
  kind: ResourceKind
  /** Goes unavailable when its account is disconnected or expires. */
  available: boolean
}

export interface IntegrationMapping {
  id: string
  resourceId: string
  osId: OSId
  /** The client. Workspaces are clients in Reporting OS and HR OS. */
  workspaceId: string
  mappedAt: string
  mappedBy: string
}

/** A resource joined to its account and mapping — what the UI actually renders. */
export interface ResolvedResource {
  resource: IntegrationResource
  account: IntegrationAccount
  mapping?: IntegrationMapping
  /** Convenience: true when the account is client-scoped. */
  clientSpecific: boolean
}

/** One client that depends on an account, and the product it lives in. */
export interface AffectedClient {
  osId: OSId
  workspaceId: string
}

/**
 * What disconnecting an account would break — shown before confirming.
 *
 * Clients are carried with their product because an organization account can be
 * feeding clients in several products at once, and "4 clients affected" is
 * misleading if three of them are somewhere the user is not looking.
 */
export interface DisconnectImpact {
  resourceCount: number
  mappedResourceCount: number
  affected: AffectedClient[]
  affectedOSIds: OSId[]
}

/* -------------------------------------------------------------------------- */
/* Assistant                                                                   */
/* -------------------------------------------------------------------------- */

export type AssistantScopeKind = 'platform' | 'os' | 'workspace'

export interface AssistantContext {
  kind: AssistantScopeKind
  osId?: OSId
  workspaceId?: string
  /** Human-readable label rendered in the context chip. */
  label: string
  /** Data sources the assistant is permitted to read in this scope. */
  dataSources: string[]
}

export type MessageRole = 'user' | 'assistant'

export interface AssistantCitation {
  source: string
  detail: string
}

export type AssistantActionStatus = 'proposed' | 'sent' | 'failed' | 'empty'

/**
 * A connector action (Slack message, Outlook email…) the assistant proposed.
 * Nothing is delivered until the user confirms it.
 */
export interface AssistantAction {
  id: string
  status: AssistantActionStatus
  /** The drafted content; editable before sending. */
  content: string
}

export interface AssistantMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  /** Present while a response is streaming in. */
  streaming?: boolean
  citations?: AssistantCitation[]
  /** Set when the answer was trimmed because of the caller's permissions. */
  permissionNotice?: string
  error?: string
  /** Present when this reply proposes a connector action awaiting confirmation. */
  action?: AssistantAction
}

export interface Conversation {
  id: string
  title: string
  context: AssistantContext
  messages: AssistantMessage[]
  createdAt: string
  updatedAt: string
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

export type ActivityKind =
  | 'sync'
  | 'report'
  | 'member'
  | 'integration'
  | 'workspace'
  | 'assistant'
  | 'alert'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  osId?: OSId
  workspaceId?: string
  title: string
  detail: string
  at: string
  actor?: string
}
