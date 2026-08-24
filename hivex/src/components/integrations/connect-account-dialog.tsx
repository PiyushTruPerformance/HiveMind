'use client'

import { motion } from 'motion/react'
import {
  AlertTriangle,
  Building2,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState } from '@/components/ui/data'
import { Field, Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { integrationService } from '@/lib/mock/services/integrationService'
import { usePlatform } from '@/lib/state/platform-provider'
import { cn } from '@/lib/utils/cn'
import {
  getIntegration,
  providerIconIntegration,
  providerName,
  servicesForProvider,
} from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type {
  ConnectionScope,
  IntegrationAccount,
  IntegrationResource,
  OSId,
} from '@/platform/types'

import { IntegrationIcon } from './integration-icon'

/**
 * Connect one provider account.
 *
 * Three steps, identical for both real pipelines:
 *
 *   authorize → discover → review
 *
 * The dialog deliberately stops at discovery. It adds an *account* and the
 * resources that account can see; deciding which client each resource feeds is
 * a separate, repeatable act that lives in the mapping table. Bundling the two
 * is what made the previous flow unable to express one Google login serving
 * twelve clients.
 *
 * Google runs through the first-party OAuth endpoints and everything else
 * through Nango's Connect UI, but the user-facing sequence is the same — which
 * is why one component drives both.
 */

type Step = 'authorize' | 'discover' | 'review'

const STEPS: { id: Step; label: string }[] = [
  { id: 'authorize', label: 'Authorize' },
  { id: 'discover', label: 'Discover' },
  { id: 'review', label: 'Review' },
]

export function ConnectAccountDialog({
  provider,
  osId,
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
  onConnected,
}: {
  /** Provider family — 'google' for the Google pipeline, else the integration id. */
  provider: string | null
  osId: OSId
  /** Present for a client-owned login; absent for a global product connection. */
  workspaceId?: string
  workspaceName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: (account: IntegrationAccount, resources: IntegrationResource[]) => void
}) {
  const toast = useToast()
  const { accounts, upsertAccount, removeAccount, addResources, connectScope } = usePlatform()

  const [step, setStep] = useState<Step>('authorize')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [account, setAccount] = useState<IntegrationAccount | null>(null)
  const [resources, setResources] = useState<IntegrationResource[]>([])

  useEffect(() => {
    if (!open) return
    setStep('authorize')
    setBusy(false)
    setError(null)
    setApiKey('')
    setAccount(null)
    setResources([])
  }, [open, provider])

  /* Abandoning the flow mid-authorization must not leave a half-built account
     sitting in the list — nothing was ever authorized. */
  useEffect(() => {
    if (open || !account) return
    if (account.status === 'connecting' || account.status === 'discovering') {
      removeAccount(account.id)
    }
  }, [open, account, removeAccount])

  const scope: ConnectionScope = connectScope(osId, workspaceId)
  const clientScoped = Boolean(workspaceId)
  const services = provider ? servicesForProvider(provider) : []
  const iconIntegration = provider ? providerIconIntegration(provider) : null

  const run = useCallback(async () => {
    if (!provider) return
    setBusy(true)
    setError(null)

    try {
      const authorized = await integrationService.authorizeAccount(provider, scope, {
        ...(apiKey.trim()
          ? { label: `API key ••••${apiKey.slice(-4).toUpperCase()}` }
          : {}),
        existingLabels: accounts.map((a) => a.label),
        connectedIn: osId,
      })

      setAccount(authorized)
      upsertAccount({ ...authorized, status: 'discovering' })
      setStep('discover')

      const discovered = await integrationService.discoverResources(authorized)
      setResources(discovered)
      addResources(discovered)
      upsertAccount(authorized)
      setStep('review')
      onConnected?.(authorized, discovered)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Authorization failed.'
      setError(message)
      setStep('authorize')
    } finally {
      setBusy(false)
    }
  }, [provider, scope, apiKey, accounts, upsertAccount, addResources, onConnected])

  if (!provider) return null

  const label = providerName(provider)
  const isApiKey =
    services.length === 1 && getIntegration(services[0]!)?.authType === 'api_key'
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {iconIntegration ? <IntegrationIcon integration={iconIntegration} size="lg" /> : null}
            <div className="min-w-0">
              <DialogTitle>Connect a {label} account</DialogTitle>
              <DialogDescription>
                {clientScoped
                  ? `This login will belong to ${workspaceName ?? 'this client'} only.`
                  : 'Added once for your organization — every product can use it.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScopeNotice
          clientScoped={clientScoped}
          osId={osId}
          workspaceName={workspaceName}
        />

        <StepRail current={stepIndex} />

        {/* Keyed remount rather than AnimatePresence: authorize can advance
            twice in quick succession, and a wait-mode exit queue can strand the
            previous panel on screen. */}
        <div className="min-h-[13rem]">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
          >
            {step === 'authorize' ? (
              <AuthorizeStep
                provider={provider}
                services={services}
                isApiKey={isApiKey}
                apiKey={apiKey}
                onApiKey={setApiKey}
                error={error}
              />
            ) : null}

            {step === 'discover' ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">
                  Reading what {account?.label ?? 'this account'} can see…
                </p>
              </div>
            ) : null}

            {step === 'review' && account ? (
              <ReviewStep account={account} resources={resources} />
            ) : null}
          </motion.div>
        </div>

        <DialogFooter>
          {step === 'review' ? (
            <Button
              variant="primary"
              onClick={() => {
                onOpenChange(false)
                toast.success(
                  `${account?.label} connected`,
                  `${resources.length} resources found. Map them to clients to start pulling data.`,
                )
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
                  disabled={isApiKey && apiKey.trim().length < 6}
                  onClick={() => void run()}
                >
                  {isApiKey ? 'Save and verify' : `Continue to ${label}`}
                  {!busy && !isApiKey ? <ExternalLink className="size-4" /> : null}
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

/**
 * Who will own the connection.
 *
 * Shown before authorizing rather than after, because global and client-owned
 * accounts behave differently later and the choice is hard to see once made.
 */
function ScopeNotice({
  clientScoped,
  osId,
  workspaceName,
}: {
  clientScoped: boolean
  osId: OSId
  workspaceName?: string
}) {
  const Icon = clientScoped ? UserRound : Building2
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5',
        clientScoped ? 'border-primary/30 bg-primary-soft/40' : 'bg-surface-sunken/60',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-medium">
          {clientScoped
            ? `Client connection — ${workspaceName ?? 'this client'}`
            : 'Organization connection'}
        </p>
        <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
          {clientScoped
            ? 'Only this client can use what this login exposes. Use it when the client insists on their own account rather than the agency one.'
            : `You are adding it from ${OS_REGISTRY[osId].shortName}, but it belongs to the organization: any product you add later that reads these services picks it up without asking you to sign in again. Nothing reaches a client until you map a resource to it.`}
        </p>
      </div>
    </div>
  )
}

function StepRail({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Connection steps">
      {STEPS.map((step, index) => {
        const done = index < current
        const active = index === current
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
            {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function AuthorizeStep({
  provider,
  services,
  isApiKey,
  apiKey,
  onApiKey,
  error,
}: {
  provider: string
  services: string[]
  isApiKey: boolean
  apiKey: string
  onApiKey: (value: string) => void
  error: string | null
}) {
  const definitions = services
    .map((id) => getIntegration(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
  const unconfirmed = definitions.filter((i) => !i.confirmed)
  const scopes = [...new Set(definitions.flatMap((i) => i.scopes))]

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Could not connect" description={error} /> : null}

      {unconfirmed.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft/60 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-2xs leading-relaxed">
            {unconfirmed[0]!.docsNote ?? 'This provider is not fully verified yet.'}
          </p>
        </div>
      ) : null}

      {isApiKey ? (
        <Field
          label={`${providerName(provider)} API key`}
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
            You will be sent to {providerName(provider)} to approve access
          </p>
          <ul className="mt-3 space-y-1.5">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-center gap-2 text-2xs text-muted-foreground">
                <KeyRound className="size-3 shrink-0" aria-hidden />
                <code className="font-mono">{scope}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {definitions.length > 1 ? (
        <div className="rounded-md border p-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            One authorization covers
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {definitions.map((definition) => (
              <span
                key={definition.id}
                className="flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-2xs"
              >
                <IntegrationIcon integration={definition} size="sm" />
                {definition.name}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-2xs leading-relaxed text-muted-foreground">
            These are services of one account, not four separate connections — and they stay
            available across every product, not just this one. You can add more accounts for the
            same provider afterwards.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function ReviewStep({
  account,
  resources,
}: {
  account: IntegrationAccount
  resources: IntegrationResource[]
}) {
  const byService = resources.reduce<Record<string, IntegrationResource[]>>((acc, resource) => {
    ;(acc[resource.service] ??= []).push(resource)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success-soft/40 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
          <Check className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{account.label} is connected</p>
          <p className="text-2xs text-muted-foreground">
            {resources.length} {resources.length === 1 ? 'resource' : 'resources'} discovered
          </p>
        </div>
      </div>

      <ul className="scrollbar-thin max-h-48 space-y-1.5 overflow-y-auto rounded-md border p-1.5">
        {Object.entries(byService).map(([service, items]) => {
          const definition = getIntegration(service)
          return (
            <li key={service} className="rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2">
                {definition ? <IntegrationIcon integration={definition} size="sm" /> : null}
                <span className="text-[13px] font-medium">{definition?.name ?? service}</span>
                <Badge tone="neutral" className="ml-auto">
                  {items.length}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 pl-7 text-2xs text-muted-foreground">
                {items.map((i) => i.name).join(' · ')}
              </p>
            </li>
          )
        })}
      </ul>

      <p className="text-2xs leading-relaxed text-muted-foreground">
        Nothing is feeding a client yet. Map these resources on the Resources &amp; mapping tab to
        decide which client each one belongs to. The account itself is now available to every
        product in your organization.
      </p>
    </div>
  )
}
