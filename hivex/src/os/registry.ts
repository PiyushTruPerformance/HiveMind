import type { OSId } from '@/platform/types'

import { hrViews } from './hr/views'
import { reportingViews } from './reporting/views'
import { seoViews } from './seo/views'
import type { OSViewMap, WorkspaceView } from './types'

/**
 * OS view registry — the second half of the "add a product without touching the
 * platform" contract.
 *
 * `os-registry.ts` declares what a product *is* (identity, navigation, plans,
 * data sources). This file declares what each of its navigation ids *renders*.
 * Adding Finance OS means: one entry in the config registry, one folder here,
 * one line below.
 */
export const OS_VIEWS: Record<OSId, OSViewMap> = {
  reporting: reportingViews,
  seo: seoViews,
  hr: hrViews,
  finance: {},
}

export function resolveView(osId: OSId, sectionId: string): WorkspaceView | undefined {
  return OS_VIEWS[osId]?.[sectionId]
}
