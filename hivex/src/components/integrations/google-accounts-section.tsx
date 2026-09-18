'use client'

import { ExternalLink, KeyRound, Link2Off, Plus, Settings2, UserRound } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { EmptyState } from '@/components/ui/data'
import { Field, Select } from '@/components/ui/field'
import { Skeleton, Tooltip } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SectionHeading } from '@/components/ui/page'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { useGoogleAccounts } from '@/lib/integrations/hooks'
import { usePlatform } from '@/lib/state/platform-provider'
import { getIntegration } from '@/platform/config/integrations'
import type { GoogleAccount, GoogleAccountResource, GoogleService } from '@/lib/integrations/api'
import type { OSId } from '@/platform/types'

import { ConnectAccountDialog } from './connect-account-dialog'
import { IntegrationIcon } from './integration-icon'
import { StatusPill } from './status-pill'

/**
 * Google accounts — the identity layer beneath the data connectors.
 *
 * One card per connected Google login. A login is authorized once and exposes
 * whatever that Google user can see (GA4 properties, Search Console sites, Ads
 * customers, Business Profile locations); any of those resources can then feed
 * any client. That is the flexible part: a single agency login can serve a
 * dozen clients, and a client can be moved to another login without
 * reconnecting anything.
 *
 * Everything shown comes from the integrations API. Nothing here invents an
 * account, a resource or a connected state.
 */

const SERVICE_LABEL: Record<GoogleService, string> = {
  ga4: 'Analytics property',
  gsc: 'Search Console site',
  'google-ads': 'Ads account',
  gbp: 'Business Profile location',
}

const SERVICE_INTEGRATION: Record<GoogleService, string> = {
  ga4: 'ga4',
  gsc: 'gsc',
  'google-ads': 'google-ads',
  gbp: 'gbp',
}

/** Where clients are created — Reporting OS owns client onboarding. */
const NEW_CLIENT_URL = 'https://tru-reporting-dev-application.vercel.app/admin/onboarding'

export function GoogleAccountsSection() {
  const { integrationsMode, workspaces } = usePlatform()
  const access = useAccess()
  const live = integrationsMode === 'live'
  const google = useGoogleAccounts(live)

  const [connecting, setConnecting] = useState(false)
  const [managing, setManaging] = useState<GoogleAccount | null>(null)

  const clients = workspaces.reporting ?? []
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Unknown client'
  const canManage = access.can('integration:connect')


  const current = managing ? (google.accounts.find((a) => a.id === managing.id) ?? managing) : null

  return (
    <section className="space-y-4">
      <SectionHeading
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-primary">
              <KeyRound className="size-3.5" aria-hidden />
            </span>
            Google accounts
          </span>
        }
        description="The Google logins your organization has authorized. Each one exposes the properties, sites and ad accounts that user can see, and you decide which client uses which."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={NEW_CLIENT_URL} target="_blank" rel="noopener noreferrer">
                <Plus className="size-3.5" />
                New client
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canManage || !live}
              onClick={() => setConnecting(true)}
            >
              <Plus className="size-3.5" />
              Add Google account
            </Button>
          </div>
        }
      />

      {!live ? (
        <EmptyState
          icon={KeyRound}
          title="Google accounts appear once the platform is connected"
          description="Sign in with your organization account to manage the Google logins behind your clients' data."
        />
      ) : google.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : google.accounts.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No Google account connected yet"
          description="Authorize a Google login once, then point each client at the properties, sites and ad accounts it should read."
          action={
            <Button variant="primary" size="sm" disabled={!canManage} onClick={() => setConnecting(true)}>
              <Plus className="size-3.5" />
              Add Google account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {google.accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              clientName={clientName}
              onManage={() => setManaging(account)}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      <ConnectAccountDialog
        provider={connecting ? 'google' : null}
        osId="reporting"
        open={connecting}
        onOpenChange={setConnecting}
      />

      <ManageAccountDialog
        account={current}
        open={Boolean(current)}
        onOpenChange={(open) => {
          if (!open) setManaging(null)
        }}
        google={google}
      />
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function AccountCard({
  account,
  clientName,
  onManage,
  canManage,
}: {
  account: GoogleAccount
  clientName: (id: string) => string
  onManage: () => void
  canManage: boolean
}) {
  const counts = account.resources.reduce<Record<string, number>>((acc, resource) => {
    acc[resource.service] = (acc[resource.service] ?? 0) + 1
    return acc
  }, {})
  const icon = getIntegration('ga4')

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {icon ? <IntegrationIcon integration={icon} size="lg" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-semibold">
            {account.email ?? `Google login · ${clientName(account.owner_client_id ?? '')}`}
          </p>
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">
            {account.email
              ? `Authorized under ${clientName(account.owner_client_id ?? '')}`
              : 'Connected before email capture — reconnect to show the address'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusPill status={account.status === 'connected' ? 'connected' : 'error'} />
        {(Object.keys(SERVICE_LABEL) as GoogleService[])
          .filter((service) => counts[service])
          .map((service) => (
            <Tooltip key={service} content={SERVICE_LABEL[service]}>
              <span className="rounded-md border bg-surface px-1.5 py-0.5 text-2xs text-muted-foreground">
                {counts[service]} {getIntegration(SERVICE_INTEGRATION[service])?.name ?? service}
              </span>
            </Tooltip>
          ))}
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Used by</p>
        {account.clients.length === 0 ? (
          <p className="mt-1 text-2xs text-muted-foreground">No client reads this account yet.</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {account.clients.map((use) => (
              <Badge key={use.client_id} tone="accent">
                <UserRound className="size-3" aria-hidden />
                {clientName(use.client_id)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-end pt-3">
        <Button variant="outline" size="sm" onClick={onManage} disabled={!canManage}>
          <Settings2 className="size-3.5" />
          Manage
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/** Resources of one account, and which client each one feeds. */
function ManageAccountDialog({
  account,
  open,
  onOpenChange,
  google,
}: {
  account: GoogleAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
  google: ReturnType<typeof useGoogleAccounts>
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const { workspaces } = usePlatform()
  const clients = workspaces.reporting ?? []
  const [target, setTarget] = useState<Record<string, string>>({})

  if (!account) return null

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id
  const assignable = account.resources.filter((r) => r.service !== 'gbp')

  const assign = async (resource: GoogleAccountResource) => {
    const clientId = target[resource.external_id]
    if (!clientId) return
    try {
      const result = await google.assign({
        accountId: account.id,
        clientId,
        service: resource.service as Exclude<GoogleService, 'gbp'>,
        externalId: resource.external_id,
      })
      toast.success(
        `${resource.name} → ${clientName(clientId)}`,
        result.moved_account
          ? 'That client now reads this Google account. Its other Google selections were cleared, because a client reads from one account.'
          : 'The client picks it up on the next sync.',
      )
    } catch (error) {
      toast.error('Assignment not saved', error instanceof Error ? error.message : undefined)
    }
  }

  const unassign = async (resource: GoogleAccountResource, clientId: string) => {
    const ok = await confirm({
      title: `Stop ${clientName(clientId)} using this resource?`,
      description: `${resource.name} will no longer be synced for that client. The Google account stays connected.`,
      confirmLabel: 'Remove',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await google.unassign({ clientId, service: resource.service as Exclude<GoogleService, 'gbp'> })
      toast.info(`${clientName(clientId)} no longer reads ${resource.name}`)
    } catch (error) {
      toast.error('Could not remove the assignment', error instanceof Error ? error.message : undefined)
    }
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect this Google account?',
      description:
        account.clients.length > 0
          ? `${account.clients.length} ${account.clients.length === 1 ? 'client' : 'clients'} currently read it and will stop syncing until you connect Google again.`
          : 'Access is revoked and its discovered resources are removed.',
      confirmLabel: 'Disconnect',
      tone: 'destructive',
    })
    if (!ok) return
    try {
      await google.disconnect(account.id)
      toast.info('Google account disconnected')
      onOpenChange(false)
    } catch (error) {
      toast.error('Could not disconnect', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg">
        <DialogHeader>
          <DialogTitle>{account.email ?? 'Google account'}</DialogTitle>
          <DialogDescription>
            Everything this Google login can see. Point each resource at the client that should read it — one client reads
            from one Google account at a time.
          </DialogDescription>
        </DialogHeader>

        {assignable.length === 0 ? (
          <EmptyState
            title="Nothing discovered yet"
            description="This Google login exposed no properties, sites or ad accounts. Reconnect it if that looks wrong."
          />
        ) : (
          <ul className="scrollbar-thin max-h-[26rem] space-y-2 overflow-y-auto pr-1">
            {assignable.map((resource) => {
              const definition = getIntegration(SERVICE_INTEGRATION[resource.service])
              return (
                <li key={`${resource.service}:${resource.external_id}`} className="rounded-lg border bg-surface p-3">
                  <div className="flex items-start gap-2.5">
                    {definition ? <IntegrationIcon integration={definition} size="sm" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{resource.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {SERVICE_LABEL[resource.service]}
                        {resource.subtitle ? ` · ${resource.subtitle}` : ''} ·{' '}
                        <code className="font-mono">{resource.external_id}</code>
                      </p>
                    </div>
                  </div>

                  {resource.client_ids.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {resource.client_ids.map((clientId) => (
                        <span
                          key={clientId}
                          className="flex items-center gap-1 rounded-full border border-success/30 bg-success-soft/50 py-0.5 pl-2 pr-1 text-2xs text-success"
                        >
                          {clientName(clientId)}
                          <button
                            type="button"
                            onClick={() => void unassign(resource, clientId)}
                            aria-label={`Remove ${clientName(clientId)} from ${resource.name}`}
                            className="rounded-full p-0.5 hover:bg-success/10"
                          >
                            <Link2Off className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap items-end gap-2">
                    <Field label="Assign to client" className="min-w-[12rem] flex-1">
                      {(props) => (
                        <Select
                          {...props}
                          value={target[resource.external_id] ?? ''}
                          onChange={(e) => setTarget((prev) => ({ ...prev, [resource.external_id]: e.target.value }))}
                        >
                          <option value="" disabled>
                            {clients.length === 0 ? 'No clients available' : 'Choose a client…'}
                          </option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={google.isMutating}
                      disabled={!target[resource.external_id] || google.isMutating}
                      onClick={() => void assign(resource)}
                    >
                      Assign
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => void disconnect()} disabled={google.isMutating}>
            <Link2Off className="size-4" />
            Disconnect account
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
