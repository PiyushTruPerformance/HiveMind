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
  | 'connected'
  | 'error'
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

export interface IntegrationResource {
  id: string
  name: string
  subtitle: string
  kind: string
}

export interface IntegrationConnection {
  integrationId: string
  status: ConnectionStatus
  connectedAt?: string
  connectedBy?: string
  accountLabel?: string
  selectedResources: IntegrationResource[]
  lastSyncAt?: string
  error?: string
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
