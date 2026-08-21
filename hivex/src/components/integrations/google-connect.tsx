'use client'

import { motion } from 'motion/react'
import { AlertTriangle, Check, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { IntegrationIcon } from '@/components/integrations/integration-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/data'
import { integrationService } from '@/lib/mock/services/integrationService'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { GOOGLE_DATA_SOURCE_IDS, getIntegration } from '@/platform/config/integrations'
import type { IntegrationResource } from '@/platform/types'

/**
 * The Google data-source flow.
 *
 * Google is the one provider where a single authorization yields several
 * products at once, so it gets a dedicated screen rather than four passes
 * through the generic connect dialog:
 *
 *   Google account → Authorization → Available properties/accounts
 *                  → Select resources → Confirm
 *
 * Mirrors the real endpoints: /auth/google/start, /auth/google/callback,
 * /auth/google/discovery, /auth/workspace/map.
 */

type Phase = 'idle' | 'authorizing' | 'discovering' | 'selecting' | 'done'

const SOURCES = GOOGLE_DATA_SOURCE_IDS.map((id) => getIntegration(id)!).filter(Boolean)

export function GoogleConnect({ onComplete }: { onComplete?: (count: number) => void }) {
  const { upsertConnection, connectionFor } = usePlatform()

  const [phase, setPhase] = useState<Phase>(() =>
    SOURCES.some((s) => connectionFor(s.id)?.status === 'connected') ? 'done' : 'idle',
  )
  const [account, setAccount] = useState<string>(
    () => SOURCES.map((s) => connectionFor(s.id)?.accountLabel).find(Boolean) ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<Record<string, IntegrationResource[]>>({})
  const [selected, setSelected] = useState<Record<string, string[]>>({})

  const start = async () => {
    setError(null)
    setPhase('authorizing')
    try {
      const { accountLabel } = await integrationService.authorize('ga4')
      setAccount(accountLabel)
      setPhase('discovering')

      const results = await Promise.all(
        SOURCES.map(async (source) => [
          source.id,
          await integrationService.discoverResources(source.id),
        ] as const),
      )

      const map = Object.fromEntries(results)
      setDiscovered(map)
      setSelected(
        Object.fromEntries(
          results.map(([id, resources]) => [id, resources.slice(0, 2).map((r) => r.id)]),
        ),
      )
      setPhase('selecting')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google authorization failed.')
      setPhase('idle')
    }
  }

  const confirm = async () => {
    setPhase('discovering')
    let count = 0
    for (const source of SOURCES) {
      const ids = selected[source.id] ?? []
      if (ids.length === 0) continue
      const resources = (discovered[source.id] ?? []).filter((r) => ids.includes(r.id))
      const connection = await integrationService.finalize(source.id, resources, account)
      upsertConnection(connection)
      count += resources.length
    }
    setPhase('done')
    onComplete?.(count)
  }

  const toggle = (sourceId: string, resourceId: string) => {
    setSelected((prev) => {
      const current = prev[sourceId] ?? []
      return {
        ...prev,
        [sourceId]: current.includes(resourceId)
          ? current.filter((id) => id !== resourceId)
          : [...current, resourceId],
      }
    })
  }

  const totalSelected = Object.values(selected).reduce((acc, ids) => acc + ids.length, 0)

  return (
    <div className="space-y-5">
      <FlowRail phase={phase} />

      {error ? <ErrorState title="Google authorization failed" description={error} /> : null}

        {phase === 'idle' || phase === 'authorizing' ? (
          <Panel key="idle">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-surface font-display text-lg font-semibold">
                  G
                </span>
                <div>
                  <p className="text-[14px] font-medium">Connect your Google account</p>
                  <p className="mt-1 max-w-md text-2xs leading-relaxed text-muted-foreground">
                    One authorization covers Analytics, Search Console, Ads and Business Profile.
                    You choose which properties to map on the next screen.
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={() => void start()}
                loading={phase === 'authorizing'}
              >
                {phase === 'authorizing' ? 'Waiting for Google…' : 'Continue with Google'}
              </Button>
            </div>

            <div className="mt-5 grid gap-2 border-t pt-4 sm:grid-cols-2">
              {SOURCES.map((source) => (
                <div key={source.id} className="flex items-center gap-2.5">
                  <IntegrationIcon integration={source} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-2xs font-medium">{source.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {source.scopes.join(', ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 flex items-start gap-1.5 text-2xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3 shrink-0 text-success" aria-hidden />
              Read-only scopes. Refresh tokens are encrypted at rest and never returned to the
              browser.
            </p>
          </Panel>
        ) : null}

        {phase === 'discovering' ? (
          <Panel key="discovering">
            <div className="flex flex-col items-center justify-center gap-3 py-14">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-[13px] text-muted-foreground">
                Reading the properties and accounts this Google login can access…
              </p>
            </div>
          </Panel>
        ) : null}

        {phase === 'selecting' ? (
          <Panel key="selecting" padded={false}>
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">Authorized as {account}</p>
                <p className="text-2xs text-muted-foreground">
                  Choose which resources this organization should read.
                </p>
              </div>
              <Badge tone="accent" className="shrink-0 tabular-nums">
                {totalSelected} selected
              </Badge>
            </div>

            <div className="divide-y">
              {SOURCES.map((source) => {
                const resources = discovered[source.id] ?? []
                return (
                  <section key={source.id} className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <IntegrationIcon integration={source} size="sm" />
                      <p className="flex-1 text-[13px] font-medium">{source.name}</p>
                      <span className="text-2xs tabular-nums text-muted-foreground">
                        {(selected[source.id] ?? []).length}/{resources.length}
                      </span>
                    </div>

                    {resources.length === 0 ? (
                      <p className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
                        <AlertTriangle className="size-3" aria-hidden />
                        Nothing available on this account.
                      </p>
                    ) : (
                      <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                        {resources.map((resource) => {
                          const checked = (selected[source.id] ?? []).includes(resource.id)
                          return (
                            <li key={resource.id}>
                              <label
                                className={cn(
                                  'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 transition-colors',
                                  checked
                                    ? 'border-primary/40 bg-primary-soft/50'
                                    : 'hover:bg-muted',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(source.id, resource.id)}
                                  className="size-4 accent-[hsl(var(--primary))]"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-2xs font-medium">
                                    {resource.name}
                                  </span>
                                  <span className="block truncate text-[10px] text-muted-foreground">
                                    {resource.subtitle} · {resource.id}
                                  </span>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5">
              <Button variant="ghost" onClick={() => setPhase('idle')}>
                Use a different account
              </Button>
              <Button variant="primary" onClick={() => void confirm()} disabled={totalSelected === 0}>
                Confirm {totalSelected} resource{totalSelected === 1 ? '' : 's'}
              </Button>
            </div>
          </Panel>
        ) : null}

        {phase === 'done' ? (
          <Panel key="done">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="size-5" />
              </span>
              <div>
                <p className="font-display text-[15px] font-semibold">Google data sources connected</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {account ? `Authorized as ${account}. ` : ''}
                  The first 90-day sync would start in the background.
                </p>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {SOURCES.map((source) => {
                  const connection = connectionFor(source.id)
                  if (connection?.status !== 'connected') return null
                  return (
                    <span
                      key={source.id}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-2xs"
                    >
                      <IntegrationIcon integration={source} size="sm" className="!size-4 !text-[8px]" />
                      {source.name}
                      <span className="text-muted-foreground">
                        {connection.selectedResources.length}
                      </span>
                    </span>
                  )
                })}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPhase('idle')}>
                Connect another account
              </Button>
            </div>
          </Panel>
        ) : null}
    </div>
  )
}

function Panel({
  children,
  padded = true,
}: {
  children: React.ReactNode
  padded?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={cn('rounded-xl border bg-card shadow-sm', padded && 'p-5')}
    >
      {children}
    </motion.div>
  )
}

function FlowRail({ phase }: { phase: Phase }) {
  const steps = ['Google account', 'Authorization', 'Available resources', 'Confirm']
  const index =
    phase === 'idle' ? 0 : phase === 'authorizing' ? 1 : phase === 'discovering' ? 2 : phase === 'selecting' ? 2 : 3

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Google connection steps">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={cn(
              'text-2xs',
              i === index ? 'font-medium text-foreground' : 'text-muted-foreground',
              i < index && 'text-success',
            )}
          >
            {step}
          </span>
          {i < steps.length - 1 ? (
            <ChevronRight className="size-3 text-muted-foreground/50" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
