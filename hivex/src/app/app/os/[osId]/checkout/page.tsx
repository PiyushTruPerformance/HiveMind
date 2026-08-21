'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Check, CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { FunnelShell } from '@/components/pricing/funnel-steps'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Separator } from '@/components/ui/misc'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { PLANS, formatPrice, priceFor, yearlySavingPercent } from '@/platform/config/plans'
import type { OSId } from '@/platform/types'

/**
 * Checkout.
 *
 * A deliberately conventional card form with a real order summary, wired to a
 * simulated authorization. The card fields are uncontrolled and never leave the
 * component — this is a demo, and collecting real card data in the app is
 * exactly what a payment provider's hosted element exists to avoid. Replacing
 * `CardFields` with a Stripe Element is the whole integration.
 */
export default function OSCheckoutPage() {
  const params = useParams<{ osId: OSId }>()
  const router = useRouter()
  const access = useAccess()
  const { completePayment } = usePlatform()

  const os = OS_REGISTRY[params.osId]
  const subscription = access.subscriptionFor(os.id)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)

  /* No plan chosen means this step has nothing to charge for. */
  useEffect(() => {
    if (!subscription) router.replace(`/app/os/${os.id}/pricing`)
  }, [subscription, os.id, router])

  if (!subscription) return null

  const plan = PLANS[subscription.planId]
  const period = subscription.billingPeriod
  const amount = priceFor(os.id, subscription.planId, period)
  const saving = period === 'yearly' ? yearlySavingPercent(os.id, subscription.planId) : 0

  async function pay(event: React.FormEvent) {
    event.preventDefault()
    setProcessing(true)
    // Stand-in for the provider round trip; the delay is what makes the
    // processing state worth having.
    await new Promise((resolve) => setTimeout(resolve, 1_400))
    completePayment(os.id)
    setProcessing(false)
    setDone(true)
  }

  if (done) {
    return (
      <FunnelShell
        osId={os.id}
        step="checkout"
        title="Payment successful"
        description={`Your ${plan.name} plan for ${os.name} is active.`}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-md py-10 text-center"
        >
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-success-soft text-success">
            <Check className="size-6" />
          </span>
          <h2 className="mt-5 font-display text-xl font-semibold tracking-tight">
            Your plan is active
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {os.name} on {plan.name}, billed {period}. Next, connect the data it needs — that part
            is required before the product will show you anything real.
          </p>
          <Button asChild variant="primary" size="lg" className="mt-6">
            <Link href={`/app/os/${os.id}/setup`}>
              Continue to setup
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      </FunnelShell>
    )
  }

  return (
    <FunnelShell
      osId={os.id}
      step="checkout"
      title="Checkout"
      description="Confirm your plan and complete the purchase."
    >
      <form onSubmit={pay} className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <CreditCard className="size-4 text-muted-foreground" />
                  Payment details
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-dashed bg-surface-sunken/60 px-3 py-2.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Demo checkout.</span> No card is
                  charged and nothing is stored. In production this block is replaced by the
                  provider&apos;s hosted card element, so card data never touches this app.
                </p>
              </div>

              <CardFields />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing address</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" className="sm:col-span-2">
                {(props) => (
                  <Select {...props} defaultValue="US">
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                    <option value="IN">India</option>
                    <option value="DE">Germany</option>
                  </Select>
                )}
              </Field>
              <Field label="City">{(props) => <Input {...props} placeholder="Seattle" />}</Field>
              <Field label="Postal code">{(props) => <Input {...props} placeholder="98101" />}</Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{os.name}</p>
                  <p className="text-2xs text-muted-foreground">{plan.name} plan</p>
                </div>
                <Badge tone="neutral" className="shrink-0 capitalize">
                  {period}
                </Badge>
              </div>

              <Separator />

              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatPrice(amount)}</dd>
                </div>
                {saving > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Annual discount</dt>
                    <dd className="tabular-nums text-success">−{saving}%</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="text-2xs text-muted-foreground">Calculated at billing</dd>
                </div>
              </dl>

              <Separator />

              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium">Due today</span>
                <span className="font-display text-xl font-semibold tabular-nums">
                  {formatPrice(amount)}
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">
                Then {formatPrice(amount)} every {period === 'monthly' ? 'month' : 'year'}. Cancel
                any time from Settings.
              </p>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={processing}
              >
                {!processing ? <Lock className="size-4" /> : null}
                {processing ? 'Authorising…' : `Pay ${formatPrice(amount)}`}
              </Button>

              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href={`/app/os/${os.id}/pricing`}>Change plan</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </FunnelShell>
  )
}

/** Isolated so a hosted provider element can replace exactly this. */
function CardFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name on card" className="sm:col-span-2" required>
        {(props) => <Input {...props} required placeholder="Alex Mercer" autoComplete="cc-name" />}
      </Field>
      <Field label="Card number" className="sm:col-span-2" required>
        {(props) => (
          <Input
            {...props}
            required
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            autoComplete="off"
          />
        )}
      </Field>
      <Field label="Expiry" required>
        {(props) => <Input {...props} required placeholder="MM / YY" autoComplete="off" />}
      </Field>
      <Field label="CVC" required>
        {(props) => <Input {...props} required placeholder="123" autoComplete="off" />}
      </Field>
    </div>
  )
}
