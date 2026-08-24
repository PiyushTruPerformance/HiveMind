'use client'

import { Check, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'

import Link from 'next/link'

import { OSTile } from '@/components/common/os-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, TBody, TD, TH, THead, TR, Table, TableShell } from '@/components/ui/data'
import { Field, Input, Select } from '@/components/ui/field'
import { Avatar, Progress, Switch, Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { INDUSTRY_OPTIONS, ORG_ACCENTS, ORG_SIZE_OPTIONS } from '@/lib/mock/data/organization'
import { usePlatform } from '@/lib/state/platform-provider'
import { useTheme, type Theme } from '@/lib/state/theme-provider'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/format'
import { OS_LIST } from '@/platform/config/os-registry'
import { ACTIVATION_COPY, routeForStatus } from '@/platform/config/activation'
import { PLANS, formatLimit, formatPlanPrice, priceFor } from '@/platform/config/plans'
import { ORG_ROLE_META } from '@/platform/config/roles'
import type { BillingPeriod, OrgRole, PlanId } from '@/platform/types'

/* -------------------------------------------------------------------------- */
/* Organization                                                                */
/* -------------------------------------------------------------------------- */

export function OrganizationSettings() {
  const toast = useToast()
  const access = useAccess()
  const { organization, setOrganization } = usePlatform()
  const [accent, setAccent] = useState(organization?.accent ?? ORG_ACCENTS[0].hue)
  const readOnly = !access.can('org:manage')

  if (!organization) return null

  return (
    <>
      {readOnly ? (
        <div className="rounded-md border border-dashed bg-surface-sunken/60 px-3 py-2.5">
          <p className="text-2xs text-muted-foreground">
            Only organization admins can change these details.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" className="sm:col-span-2">
            {(props) => <Input {...props} defaultValue={organization.name} disabled={readOnly} />}
          </Field>
          <Field label="Email domain" hint="Colleagues with this domain can request to join.">
            {(props) => <Input {...props} defaultValue={organization.domain} disabled={readOnly} />}
          </Field>
          <Field label="Team size">
            {(props) => (
              <Select {...props} defaultValue={organization.size} disabled={readOnly}>
                {ORG_SIZE_OPTIONS.map((o) => (
                  <option key={o}>{o} people</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Industry" className="sm:col-span-2">
            {(props) => (
              <Select {...props} defaultValue={organization.industry} disabled={readOnly}>
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-5">
          <span
            className="flex size-14 items-center justify-center rounded-xl font-display text-lg font-semibold"
            style={{ backgroundColor: `hsl(${accent} / 0.14)`, color: `hsl(${accent})` }}
          >
            {organization.monogram}
          </span>
          <div className="flex flex-wrap gap-2">
            {ORG_ACCENTS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={readOnly}
                onClick={() => setAccent(option.hue)}
                aria-label={option.label}
                aria-pressed={accent === option.hue}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50',
                  accent === option.hue ? 'border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: `hsl(${option.hue})` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground">
          Created {formatDate(organization.createdAt)}
        </p>
        <Button
          variant="primary"
          disabled={readOnly}
          onClick={() => {
            setOrganization({ ...organization, accent })
            toast.success('Organization updated')
          }}
        >
          Save changes
        </Button>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                        */
/* -------------------------------------------------------------------------- */

export function PlanSettings() {
  const access = useAccess()
  const { subscriptions, accounts, members } = usePlatform()

  const connected = accounts.filter((a) => a.status === 'connected').length
  const approved = members.filter((m) => m.status === 'approved').length

  const held = OS_LIST.filter((os) => subscriptions[os.id])
  const active = held.filter((os) => subscriptions[os.id]?.status === 'active')
  const monthlyTotal = active.reduce((total, os) => {
    const subscription = subscriptions[os.id]!
    return total + priceFor(os.id, subscription.planId, subscription.billingPeriod)
  }, 0)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Each product is billed on its own plan, so you only pay for what you use.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {held.length === 0 ? (
            <EmptyState
              compact
              title="No products yet"
              description="Explore a product from Home to add your first subscription."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link href="/app">Browse products</Link>
                </Button>
              }
            />
          ) : (
            <>
              {held.map((os) => {
                const subscription = subscriptions[os.id]!
                const plan = PLANS[subscription.planId]
                const isActive = subscription.status === 'active'
                return (
                  <div
                    key={os.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <OSTile os={os} size="md" locked={!isActive} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{os.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {plan.name} · billed {subscription.billingPeriod}
                      </p>
                    </div>
                    {isActive ? (
                      <Badge tone="success" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="warning" pending dot>
                        {ACTIVATION_COPY[subscription.status].label}
                      </Badge>
                    )}
                    <span className="shrink-0 text-[13px] font-medium tabular-nums">
                      {formatPlanPrice(os.id, subscription.planId, subscription.billingPeriod)}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={
                          isActive
                            ? `/app/os/${os.id}/pricing`
                            : routeForStatus(os.id, subscription.status)
                        }
                      >
                        {isActive ? 'Change plan' : ACTIVATION_COPY[subscription.status].cta}
                      </Link>
                    </Button>
                  </div>
                )
              })}

              <div className="flex items-baseline justify-between border-t pt-3">
                <span className="text-[13px] font-medium">Current total</span>
                <span className="font-display text-xl font-semibold tabular-nums">
                  ${monthlyTotal.toLocaleString('en-US')}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Limits are per product, so usage is reported per product too. */}
      {active.map((os) => {
        const plan = PLANS[subscriptions[os.id]!.planId]
        const workspaces = access.workspacesIn(os.id).length
        const usage = [
          { label: 'Workspaces', used: workspaces, limit: plan.limits.workspacesPerOS },
          { label: 'Members', used: approved, limit: plan.limits.members },
          { label: 'Connected tools', used: connected, limit: plan.limits.integrations },
          { label: 'Ask Tru messages this month', used: 128, limit: plan.limits.aiMessagesPerMonth },
        ]
        return (
          <Card key={os.id}>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <OSTile os={os} size="sm" />
                  {os.name} usage
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {usage.map((row) => {
                const unlimited = row.limit === -1
                const ratio = unlimited ? 0 : Math.min(row.used / Math.max(row.limit, 1), 1)
                return (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px]">{row.label}</span>
                      <span className="text-2xs tabular-nums text-muted-foreground">
                        {row.used.toLocaleString('en-US')} / {formatLimit(row.limit)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Progress
                        value={unlimited ? 100 : ratio * 100}
                        tone={unlimited ? 'success' : ratio > 0.85 ? 'warning' : 'neutral'}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      {!access.can('org:billing') ? (
        <p className="text-2xs text-muted-foreground">
          Only organization admins can change a subscription.
        </p>
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Members                                                                     */
/* -------------------------------------------------------------------------- */

export function MembersSettings() {
  const toast = useToast()
  const access = useAccess()
  const { members } = usePlatform()
  const [invite, setInvite] = useState('')
  const [role, setRole] = useState<OrgRole>('team_member')

  const waiting = members.filter((m) => m.status === 'waiting')

  return (
    <>
      {access.can('members:invite') ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite people</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                toast.success('Invitation sent', `${invite} was invited as ${ORG_ROLE_META[role].label}.`)
                setInvite('')
              }}
            >
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="colleague@company.com"
                  aria-label="Email address"
                  className="pl-9"
                />
              </div>
              <div className="sm:w-48">
                <Select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} aria-label="Role">
                  {(['admin', 'vp', 'team_lead', 'team_member', 'client'] as OrgRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ORG_ROLE_META[r].label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="primary" disabled={!invite.trim()}>
                <UserPlus className="size-4" />
                Invite
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {waiting.length > 0 && access.can('members:approve') ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {waiting.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3">
                <Avatar name={member.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{member.user.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">{member.user.email}</p>
                </div>
                <Badge tone="warning" pending dot>
                  Waiting
                </Badge>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => toast.success(`${member.user.name} approved`)}
                >
                  <Check className="size-3.5" />
                  Approve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <TableShell>
        <Table>
          <THead>
            <TR>
              <TH>Member</TH>
              <TH>Organization role</TH>
              <TH>Product access</TH>
              <TH>Joined</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {members.map((member) => (
              <TR key={member.id}>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={member.user.name} src={member.user.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.user.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <Tooltip content={ORG_ROLE_META[member.role].description}>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      {ORG_ROLE_META[member.role].label}
                    </span>
                  </Tooltip>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {member.osAccess.length === 0 ? (
                      <Badge tone="neutral">Inherits role</Badge>
                    ) : (
                      member.osAccess.map((osId) => (
                        <Badge key={osId} tone="neutral">
                          {osId}
                        </Badge>
                      ))
                    )}
                  </div>
                </TD>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {formatDate(member.joinedAt)}
                </TD>
                <TD>
                  <Badge
                    tone={member.status === 'approved' ? 'success' : 'warning'}
                    pending={member.status !== 'approved'}
                    dot
                    className="capitalize"
                  >
                    {member.status}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Role model
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Access is evaluated at three levels: organization role, per-product role, and
            per-workspace grants. Everything above reads from one central policy module, so
            connecting a real RBAC service later replaces the policy, not the screens.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {(['admin', 'vp', 'team_lead', 'team_member', 'client'] as OrgRole[]).map((r) => (
              <div key={r} className="rounded-md border p-3">
                <dt className="text-[13px] font-medium">{ORG_ROLE_META[r].label}</dt>
                <dd className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                  {ORG_ROLE_META[r].description}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                 */
/* -------------------------------------------------------------------------- */

export function PreferencesSettings() {
  const { theme, setTheme } = useTheme()
  const [density, setDensity] = useState(false)
  const [emailDigest, setEmailDigest] = useState(true)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as Theme[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                aria-pressed={theme === option}
                className={cn(
                  'flex-1 rounded-lg border p-3 text-left transition-colors',
                  theme === option ? 'border-primary bg-primary-soft/40' : 'hover:bg-muted',
                )}
              >
                <span className="block text-[13px] font-medium capitalize">{option}</span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {option === 'system' ? 'Follow your OS setting' : `Always ${option}`}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Compact tables"
            description="Reduce row height in data-dense views."
            checked={density}
            onChange={setDensity}
          />
          <ToggleRow
            label="Weekly email digest"
            description="A Monday summary of every product you have access to."
            checked={emailDigest}
            onChange={setEmailDigest}
          />
        </CardContent>
      </Card>
    </>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}
