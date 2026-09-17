'use client'

import { useState } from 'react'

import { Skeleton } from '@/components/ui/misc'

import { REPORTING_OS_EMBED_URL } from './embed'

/**
 * TEMPORARY REPORTING OS EMBED — the deployed Tru Reporting OS in an iframe.
 *
 * Fills its parent. On Reporting OS pages the app shell gives it the entire
 * content area beside the OS rail (no top bar, section sidebar or padding —
 * see `immersive` in components/shell/app-shell.tsx), so the embedded app owns
 * all scrolling and there are no nested scrollbars.
 *
 * Authentication limitation: both apps use the same Clerk instance, but a
 * Clerk session is held in cookies scoped to each app's own domain. Inside this
 * cross-site iframe those cookies are third-party; browsers that block them
 * start the embedded app signed out, and its sign-in redirect goes to Clerk's
 * hosted page, which refuses to be framed (X-Frame-Options: SAMEORIGIN /
 * frame-ancestors). The lasting fix is a deployment change — a Clerk
 * production instance with both apps on one parent domain.
 */
export function ReportingOSIframe() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative size-full bg-background">
      {!loaded ? (
        <div className="absolute inset-0 space-y-4 p-6" role="status" aria-label="Loading Tru Reporting OS">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ) : null}
      <iframe
        src={REPORTING_OS_EMBED_URL}
        title="Tru Reporting OS"
        onLoad={() => setLoaded(true)}
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="relative block size-full border-0"
      />
    </div>
  )
}
