'use client'

import { AssistantPanel } from '@/components/assistant/assistant-panel'
import { PageTransition } from '@/components/ui/page'

/**
 * The assistant at full width, scoped to the whole organization.
 *
 * Identical component to the dock — the scope comes from the route, so being
 * here means "everything you can access", not "a different assistant".
 *
 * No page header: the panel already names Ask Tru and shows its scope, so the
 * panel takes the full content height (viewport minus the 3.5rem top bar and the
 * content area's 1.5rem vertical padding on each side).
 */
export default function AssistantPage() {
  return (
    <PageTransition>
      <div className="h-[calc(100dvh-6.5rem)] min-h-[32rem] overflow-hidden rounded-xl border shadow-sm">
        <AssistantPanel variant="page" />
      </div>
    </PageTransition>
  )
}
