'use client'

import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { usePlatform } from '@/lib/state/platform-provider'

/**
 * Demo shortcut: loads the seeded organization, marks onboarding complete and
 * drops straight into the platform. Onboarding is still fully walkable from
 * "Start from scratch" — this exists so a client demo can skip to the product.
 */
export function DemoEntry() {
  const router = useRouter()
  const { loadSampleOrganization } = usePlatform()

  return (
    <Button
      variant="primary"
      size="lg"
      onClick={() => {
        loadSampleOrganization()
        router.push('/app')
      }}
    >
      <Play className="size-4" />
      Explore the sample organization
    </Button>
  )
}
