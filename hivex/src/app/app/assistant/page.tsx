'use client'

import { AssistantPanel } from '@/components/assistant/assistant-panel'
import { PageHeader, PageTransition } from '@/components/ui/page'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'

/**
 * The assistant at full width, scoped to the whole organization.
 *
 * Identical component to the dock — the scope comes from the route, so being
 * here means "everything you can access", not "a different assistant".
 */
export default function AssistantPage() {
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Platform"
        title={ASK_TRU_NAME}
        description="Ask across every product and workspace you have access to. Answers state which sources they used, and say so when something was left out."
      />
      <div className="mt-5 h-[calc(100dvh-15rem)] min-h-[32rem] overflow-hidden rounded-xl border shadow-sm">
        <AssistantPanel variant="page" />
      </div>
    </PageTransition>
  )
}
