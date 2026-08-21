'use client'

import { motion } from 'motion/react'
import { AlertTriangle, Check, ExternalLink, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { ErrorState } from '@/components/ui/data'
import { useToast } from '@/components/ui/toast'
import { integrationService } from '@/lib/mock/services/integrationService'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { IntegrationDefinition, IntegrationResource } from '@/platform/types'

import { IntegrationIcon } from './integration-icon'

/**
 * The connection flow.
 *
 * Four steps, identical for both pipelines:
 *
 *   authorize → discover → select → confirm
 *
 * Google runs it through the first-party OAuth endpoints, everything else
 * through Nango's Connect UI, but the user-facing sequence is the same — which
 * is why one component drives both. Replacing the mock service with the real
 * one does not change a line of this file.
 */

type Step = 'authorize' | 'discover' | 'select' | 'confirm'

const STEPS: { id: Step; label: string }[] = [
  { id: 'authorize', label: 'Authorize' },
  { id: 'discover', label: 'Discover' },
  { id: 'select', label: 'Select' },
  { id: 'confirm', label: 'Confirm' },
]

export function ConnectDialog({
  integration,
  open,
  onOpenChange,
}: {
  integration: IntegrationDefinition | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const { upsertConnection, removeConnection, connectionFor } = usePlatform()

  const [step, setStep] = useState<Step>('authorize')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountLabel, setAccountLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [resources, setResources] = useState<IntegrationResource[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setStep('authorize')
    setBusy(false)
    setError(null)
    setAccountLabel('')
    setApiKey('')
    setResources([])
    setSelectedIds([])
  }, [open, integration?.id])

  /* Abandoning the flow mid-authorization must not leave the provider stuck in
     `connecting` — that state disables its own Connect button forever. */
  useEffect(() => {
    if (open || !integration) return
    if (connectionFor(integration.id)?.status === 'connecting') {
      removeConnection(integration.id)
    }
  }, [open, integration, connectionFor, removeConnection])

  const authorize = useCallback(async () => {
    if (!integration) return
    setBusy(true)
    setError(null)
    upsertConnection({ integrationId: integration.id, status: 'connecting', selectedResources: [] })

    try {
      const label =
        integration.authType === 'api_key'
          ? `API key ••••${apiKey.slice(-4).toUpperCase() || '0000'}`
          : (await integrationService.authorize(integration.id)).accountLabel
      setAccountLabel(label)

      if (!integration.hasResourceSelection) {
        const connection = await integrationService.finalize(integration.id, [], label)
        upsertConnection(connection)
        setStep('confirm')
        return
      }

      setStep('discover')
      const discovered = await integrationService.discoverResources(integration.id)
      setResources(discovered)
      setSelectedIds(discovered.slice(0, Math.min(3, discovered.length)).map((r) => r.id))
      setStep('select')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Authorization failed.'
      setError(message)
      upsertConnection({
        integrationId: integration.id,
        status: 'error',
        selectedResources: [],
        error: message,
      })
      setStep('authorize')
    } finally {
      setBusy(false)
    }
  }, [integration, apiKey, upsertConnection])

  const finalize = async () => {
    if (!integration) return
    setBusy(true)
    try {
      const selected = resources.filter((r) => selectedIds.includes(r.id))
      const connection = await integrationService.finalize(integration.id, selected, accountLabel)
      upsertConnection(connection)
      setStep('confirm')
    } finally {
      setBusy(false)
    }
  }

  if (!integration) return null

  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const consumers = integration.usedBy.map((id) => OS_REGISTRY[id].shortName)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IntegrationIcon integration={integration} size="lg" />
            <div className="min-w-0">
              <DialogTitle>Connect {integration.name}</DialogTitle>
              <DialogDescription>{integration.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <StepRail current={stepIndex} skipDiscovery={!integration.hasResourceSelection} />

        {/* Keyed remount rather than AnimatePresence: the authorize step can
            advance twice in quick succession (authorize → discover → select),
            and a wait-mode exit queue can strand the previous panel on screen. */}
        <div className="min-h-[13rem]">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
            >
              {step === 'authorize' ? (
                <AuthorizeStep
                  integration={integration}
                  apiKey={apiKey}
                  onApiKey={setApiKey}
                  error={error}
                  consumers={consumers}
                />
              ) : null}

              {step === 'discover' ? (
                <div className="flex flex-col items-center justify-center gap-3 py-14">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">
                    Reading the accounts and properties this login can see…
                  </p>
                </div>
              ) : null}

              {step === 'select' ? (
                <ResourceSelect
                  integration={integration}
                  resources={resources}
                  selectedIds={selectedIds}
                  onToggle={(id) =>
                    setSelectedIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                  accountLabel={accountLabel}
                />
              ) : null}

              {step === 'confirm' ? (
                <ConfirmStep
                  integration={integration}
                  accountLabel={accountLabel}
                  count={selectedIds.length}
                />
              ) : null}
            </motion.div>
        </div>

        <DialogFooter>
          {step === 'confirm' ? (
            <Button
              variant="primary"
              onClick={() => {
                onOpenChange(false)
                toast.success(`${integration.name} connected`)
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              {step === 'authorize' ? (
                <Button
                  variant="primary"
                  loading={busy}
                  disabled={integration.authType === 'api_key' && apiKey.trim().length < 6}
                  onClick={() => void authorize()}
                >
                  {integration.authType === 'api_key' ? 'Save and verify' : `Continue to ${integration.name}`}
                  {!busy && integration.authType !== 'api_key' ? (
                    <ExternalLink className="size-4" />
                  ) : null}
                </Button>
              ) : null}
              {step === 'select' ? (
                <Button
                  variant="primary"
                  loading={busy}
                  disabled={selectedIds.length === 0}
                  onClick={() => void finalize()}
                >
                  Connect {selectedIds.length} selected
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */

function StepRail({ current, skipDiscovery }: { current: number; skipDiscovery: boolean }) {
  const steps = skipDiscovery ? STEPS.filter((s) => s.id !== 'discover' && s.id !== 'select') : STEPS
  return (
    <ol className="flex items-center gap-1.5" aria-label="Connection steps">
      {steps.map((step, index) => {
        const activeIndex = skipDiscovery ? (current >= 3 ? 1 : 0) : current
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                done
                  ? 'border-success bg-success text-success-foreground'
                  : active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <span className={cn('text-2xs', active ? 'font-medium' : 'text-muted-foreground')}>
              {step.label}
            </span>
            {index < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function AuthorizeStep({
  integration,
  apiKey,
  onApiKey,
  error,
  consumers,
}: {
  integration: IntegrationDefinition
  apiKey: string
  onApiKey: (value: string) => void
  error: string | null
  consumers: string[]
}) {
  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Could not connect" description={error} /> : null}

      {!integration.confirmed ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft/60 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-2xs leading-relaxed">
            {integration.docsNote ?? 'This provider is not fully verified yet.'}
          </p>
        </div>
      ) : null}

      {integration.authType === 'api_key' ? (
        <Field
          label={`${integration.name} API key`}
          hint="Stored encrypted. Never exposed to the browser after saving."
          required
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={apiKey}
              onChange={(e) => onApiKey(e.target.value)}
              placeholder="••••••••••••••••"
              autoComplete="off"
            />
          )}
        </Field>
      ) : (
        <div className="rounded-md border bg-surface-sunken/60 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <ShieldCheck className="size-4 text-success" aria-hidden />
            You will be sent to {integration.name} to approve access
          </p>
          <ul className="mt-3 space-y-1.5">
            {integration.scopes.map((scope) => (
              <li key={scope} className="flex items-center gap-2 text-2xs text-muted-foreground">
                <KeyRound className="size-3 shrink-0" aria-hidden />
                <code className="font-mono">{scope}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border p-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Used by
        </p>
        <p className="mt-1 text-[13px]">{consumers.join(', ')}</p>
        <p className="mt-2 text-2xs text-muted-foreground">
          {integration.authType === 'google_oauth'
            ? 'First-party Google OAuth pipeline — native sync and report builders.'
            : `Brokered through Nango as “${integration.providerSlug}”.`}
        </p>
      </div>
    </div>
  )
}

function ResourceSelect({
  integration,
  resources,
  selectedIds,
  onToggle,
  accountLabel,
}: {
  integration: IntegrationDefinition
  resources: IntegrationResource[]
  selectedIds: string[]
  onToggle: (id: string) => void
  accountLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium">Select what to connect</p>
          <p className="text-2xs text-muted-foreground">
            Authorized as {accountLabel}. {resources.length} available.
          </p>
        </div>
        <span className="text-2xs tabular-nums text-muted-foreground">
          {selectedIds.length} selected
        </span>
      </div>

      <ul className="scrollbar-thin max-h-56 space-y-1.5 overflow-y-auto rounded-md border p-1.5">
        {resources.map((resource) => {
          const checked = selectedIds.includes(resource.id)
          return (
            <li key={resource.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
                  checked ? 'border-primary/40 bg-primary-soft/50' : 'border-transparent hover:bg-muted',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(resource.id)}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                <IntegrationIcon integration={integration} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{resource.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {resource.subtitle} · <code className="font-mono">{resource.id}</code>
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ConfirmStep({
  integration,
  accountLabel,
  count,
}: {
  integration: IntegrationDefinition
  accountLabel: string
  count: number
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success">
        <Check className="size-5" />
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold">{integration.name} is connected</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {accountLabel}
          {count > 0 ? ` · ${count} resource${count === 1 ? '' : 's'} mapped` : ''}
        </p>
      </div>
      <p className="max-w-sm text-2xs leading-relaxed text-muted-foreground">
        The first sync would run in the background. Connected sources become available to the
        products that use them, and to Ask Tru within your permissions.
      </p>
    </div>
  )
}
