import type { OSId } from '@/platform/types'

/**
 * Ask Tru — where it is available, decided in one place.
 *
 * The product rule is that Ask Tru belongs on the platform home and on a
 * product's own pages, but **never on a client-specific page**. In this
 * codebase a client *is* a workspace (Reporting OS clients and HR OS hiring
 * clients both map to the platform workspace entity), so the rule reduces to:
 * no Ask Tru inside `/app/os/{osId}/w/{workspaceId}/...`.
 *
 * Every surface that renders Ask Tru — the top bar button, the dock, the
 * launcher, the sidebar link, the command palette — asks this module rather
 * than testing the path itself. That is what makes "remove it from client
 * pages" a rule the codebase enforces instead of a change someone has to
 * remember to repeat.
 */

export const ASK_TRU_NAME = 'Ask Tru'

export type AskTruScopeKind = 'platform' | 'os' | 'workspace'

export interface AskTruAvailability {
  available: boolean
  /** Why it is hidden, for the one place that explains it to the user. */
  reason?: 'client_page'
}

/**
 * Products whose workspaces are *not* client-specific could opt back in here.
 *
 * Left empty deliberately: SEO OS calls its workspaces Projects, but the rule
 * as specified is a blanket one, and a per-product exception is a product
 * decision rather than an engineering one. Adding `seo: true` is the whole
 * change if that decision is later made.
 */
const WORKSPACE_OVERRIDES: Partial<Record<OSId, boolean>> = {}

export function askTruAvailability(scope: {
  kind: AskTruScopeKind
  osId?: OSId
}): AskTruAvailability {
  if (scope.kind !== 'workspace') return { available: true }
  if (scope.osId && WORKSPACE_OVERRIDES[scope.osId]) return { available: true }
  return { available: false, reason: 'client_page' }
}

export function isAskTruAvailable(scope: { kind: AskTruScopeKind; osId?: OSId }): boolean {
  return askTruAvailability(scope).available
}

/** Prompts offered at platform scope. */
export const ASK_TRU_PLATFORM_SUGGESTIONS = [
  'What needs my attention?',
  'Which OS should I use for SEO?',
  'Show me my connected data sources',
  'What can Reporting OS do?',
] as const
