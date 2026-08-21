import Link from 'next/link'

import { BrandLockup } from '@/components/common/brand-mark'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLockup />
      <div>
        <p className="font-display text-4xl font-semibold tracking-tight">404</p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          That page does not exist on this platform.
        </p>
      </div>
      <Button asChild variant="primary">
        <Link href="/app">Back to your products</Link>
      </Button>
    </div>
  )
}
