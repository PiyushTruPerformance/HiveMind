'use client'

import { PlugZap, RefreshCw, ServerCrash } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/ui/data'
import { Skeleton } from '@/components/ui/misc'
import { HR_API_BASE_URL, HrApiError } from '../api/client'

/**
 * Connection states for the HR OS service.
 *
 * HR OS is the one product backed by a real service rather than fixtures, so it
 * is also the one product that can be *down*. Rather than an empty screen, an
 * unreachable service says so and gives the command that fixes it — the failure
 * mode a developer actually hits on a fresh clone.
 */
export function HrServiceError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof HrApiError && error.offline

  if (offline) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-5">
        <div className="flex items-start gap-3">
          <ServerCrash className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 space-y-2">
            <p className="text-[13px] font-medium">The HR OS service is not running</p>
            <p className="text-2xs leading-relaxed text-muted-foreground">
              Recruitment data is served by <code className="font-mono">services/hr-os</code>, not
              by mock data. Start it and this screen fills in.
            </p>
            <pre className="overflow-x-auto rounded-md border bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed">
              {`cd services/hr-os\n.venv\\Scripts\\Activate.ps1\nuvicorn app.main:app --reload --port 8000`}
            </pre>
            <p className="text-2xs text-muted-foreground">
              Expected at <code className="font-mono">{HR_API_BASE_URL}</code> — override with{' '}
              <code className="font-mono">NEXT_PUBLIC_HR_API_URL</code>.
            </p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ErrorState
      title="The HR OS service returned an error"
      description={error instanceof Error ? error.message : 'Unknown error.'}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        ) : undefined
      }
    />
  )
}

export function HrLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-56" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

/**
 * One wrapper for the load / error / empty triad so every HR screen behaves
 * identically instead of each re-deciding what "nothing here" looks like.
 */
export function HrQueryBoundary<T>({
  query,
  empty,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }
  empty?: { title: string; description?: string; action?: ReactNode }
  children: (data: T) => ReactNode
}) {
  if (query.isLoading) return <HrLoading />
  if (query.isError) return <HrServiceError error={query.error} onRetry={() => query.refetch()} />
  if (!query.data) return null

  if (empty && Array.isArray(query.data) && query.data.length === 0) {
    return (
      <EmptyState
        icon={PlugZap}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    )
  }

  return <>{children(query.data)}</>
}
