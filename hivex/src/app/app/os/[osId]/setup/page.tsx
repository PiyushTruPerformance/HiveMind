'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Check, Recycle, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { ConnectedAccounts } from '@/components/integrations/connected-accounts'
import {
  OSIntegrationChecklist,
  useOSIntegrationProgress,
} from '@/components/integrations/os-integration-checklist'
import { FunnelShell } from '@/components/pricing/funnel-steps'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { GOOGLE_DATA_SOURCE_IDS } from '@/platform/config/integrations'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import type { OSId } from '@/platform/types'

/**
 * Mandatory setup, run once per product straight after payment.
 *
 * "Mandatory" is enforced by the Continue button, not by trapping the user: the
 * required list comes from the OS registry, and the button unlocks when it is
 * satisfied. Products whose required list is empty can finish immediately.
 *
 * Products that read Google data lead with the account list, because one
 * authorization covers GA4, Search Console, Ads and Business Profile at once —
 * approving four separately is four times the friction for no benefit. Which
 * client each discovered property feeds is decided afterwards, on the product's
 * Integrations page; setup only has to prove a source exists.
 */
export default function OSSetupPage() {
  const params = useParams<{ osId: OSId }>()
  const router = useRouter()
  const toast = useToast()
  const access = useAccess()
  const { completeSetup, accountsFor } = usePlatform()

  const os = OS_REGISTRY[params.osId]
  const subscription = access.subscriptionFor(os.id)
  const progress = useOSIntegrationProgress(os.id)
  const [finishing, setFinishing] = useState(false)

  /*
   * Logins the organization already has from another product.
   *
   * Setup is the moment this matters most: someone who has just bought a second
   * product expects to be asked to sign in again, and the fastest way to earn
   * the opposite reaction is to say so before they start clicking Connect.
   */
  const reused = accountsFor(os.id).filter(
    (account) => account.scope.kind === 'organization' && account.connectedIn !== os.id,
  )

  const usesGoogle = os.requiredIntegrations
    .concat(os.optionalIntegrations)
    .some((id) => (GOOGLE_DATA_SOURCE_IDS as readonly string[]).includes(id))

  /* Nothing paid for means nothing to set up. */
  useEffect(() => {
    if (!subscription) router.replace(`/app/os/${os.id}/pricing`)
  }, [subscription, os.id, router])

  if (!subscription) return null

  const alreadyActive = subscription.status === 'active'

  function finish() {
    setFinishing(true)
    completeSetup(os.id)
    toast.success(`${os.name} is ready`, 'Setup complete.')
    router.push(`/app/os/${os.id}`)
  }

  return (
    <FunnelShell
      osId={os.id}
      step="setup"
      title={`Set up ${os.shortName}`}
      description={
        <>
          Your plan is active. Connect the data {os.shortName} runs on — required sources have to
          be connected before you can enter the product.
        </>
      }
    >
      <div className="space-y-5">
        {reused.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Recycle className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <div>
                <p className="text-[13px] font-medium">
                  {reused.length} {reused.length === 1 ? 'account is' : 'accounts are'} carried over
                  from your other products
                </p>
                <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                  {reused.map((a) => a.label).join(', ')} — already authorized for your
                  organization, so {os.shortName} can read {reused.length === 1 ? 'it' : 'them'}
                  {progress.satisfied ? ' and setup is already satisfied.' : ' without a second sign-in.'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {usesGoogle ? (
          <Card>
            <CardHeader>
              <CardTitle>Google data sources</CardTitle>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                One authorization covers every Google product {os.shortName} reads, and it belongs
                to your organization rather than to this product — so anything you connected
                elsewhere is already listed. Connect as many accounts as you have; you assign their
                properties to clients afterwards.
              </p>
            </CardHeader>
            <CardContent>
              <ConnectedAccounts osId={os.id} compact />
            </CardContent>
          </Card>
        ) : null}

        <OSIntegrationChecklist osId={os.id} variant="setup" />

        <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background/90 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs text-muted-foreground">
            {progress.satisfied
              ? 'All required sources are connected.'
              : `${progress.required.length - progress.connectedRequired} required ${
                  progress.required.length - progress.connectedRequired === 1
                    ? 'source is'
                    : 'sources are'
                } still missing.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {alreadyActive ? (
              <Button asChild variant="ghost">
                <Link href={`/app/os/${os.id}`}>Back to {os.shortName}</Link>
              </Button>
            ) : null}
            <Tooltip
              content={
                progress.satisfied
                  ? undefined
                  : `Connect every required source before entering ${os.shortName}.`
              }
            >
              <span>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={finish}
                  disabled={!progress.satisfied}
                  loading={finishing}
                >
                  Enter {os.shortName}
                  <ArrowRight className="size-4" />
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>

        {progress.satisfied ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft/40 p-4"
          >
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium">You&apos;re all set</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-2xs leading-relaxed text-muted-foreground">
                <Sparkles className="size-3 text-primary" aria-hidden />
                Ask Tru can now answer questions from these sources inside {os.shortName}.
              </p>
            </div>
          </motion.div>
        ) : null}
      </div>
    </FunnelShell>
  )
}
