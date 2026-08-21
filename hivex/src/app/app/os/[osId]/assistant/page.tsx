'use client'

import { useParams } from 'next/navigation'

import { AssistantPanel } from '@/components/assistant/assistant-panel'
import { OSTile } from '@/components/common/os-tile'
import { PageHeader, PageTransition } from '@/components/ui/page'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * OS-scoped assistant, full width.
 *
 * Same component as the dock — the scope is derived from the route, so simply
 * being on this URL narrows what the assistant reads to this product.
 */
export default function OSAssistantPage() {
  const params = useParams<{ osId: OSId }>()
  const os = OS_REGISTRY[params.osId]

  return (
    <PageTransition>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <OSTile os={os} size="sm" />
            {os.name}
          </span>
        }
        title={ASK_TRU_NAME}
        description={`Scoped to ${os.name}. Reading ${os.assistant.dataSources.join(', ')} — limited to what your role can see.`}
      />

      <div className="mt-5 h-[calc(100dvh-16rem)] min-h-[30rem] overflow-hidden rounded-xl border shadow-sm">
        <AssistantPanel variant="page" />
      </div>
    </PageTransition>
  )
}
