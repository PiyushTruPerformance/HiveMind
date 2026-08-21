'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SignIn, SignUp } from '@clerk/nextjs'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'

import { BrandLockup } from '@/components/common/brand-mark'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { isClerkEnabled } from '@/lib/auth/authMode'
import { DEMO_USER } from '@/lib/mock/data/organization'
import { BRAND, PLATFORM_PILLARS } from '@/platform/config/brand'

/**
 * Authentication entry.
 *
 * With Clerk keys present this renders Clerk's own component, exactly as the
 * Reporting OS does. Without them it renders a demo panel that performs the
 * same navigation so the walkthrough is never blocked on credentials.
 */
export function AuthPanel({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,34rem)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-surface-sunken p-10 lg:flex">
        <div className="ambient" aria-hidden />
        <BrandLockup />
        <div className="relative max-w-md space-y-8">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            {BRAND.tagline}.
          </h1>
          <ul className="space-y-5">
            {PLATFORM_PILLARS.map((pillar) => (
              <li key={pillar.title}>
                <p className="text-[14px] font-medium">{pillar.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-2xs text-muted-foreground">
          {BRAND.name} — frontend foundation build.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLockup />
          </div>
          {isClerkEnabled ? (
            mode === 'sign-in' ? (
              <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/app" />
            ) : (
              <SignUp routing="hash" signInUrl="/sign-in" forceRedirectUrl="/app" />
            )
          ) : (
            <DemoAuthForm mode={mode} />
          )}
        </div>
      </main>
    </div>
  )
}

function DemoAuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [email, setEmail] = useState(DEMO_USER.email)
  const [submitting, setSubmitting] = useState(false)

  const isSignUp = mode === 'sign-up'

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitting(true)
        router.push('/app')
      }}
    >
      <div className="space-y-1.5">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {isSignUp
            ? 'One account gives you every product your organization subscribes to.'
            : 'Sign in to your organization.'}
        </p>
      </div>

      <div className="rounded-md border border-dashed bg-surface-sunken/60 px-3 py-2.5">
        <p className="text-2xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Demo identity mode.</span> No Clerk
          publishable key is configured, so this form signs you in as{' '}
          <span className="font-medium text-foreground">{DEMO_USER.name}</span> without
          contacting an identity provider.
        </p>
      </div>

      <Field label="Work email" required>
        {(props) => (
          <Input
            {...props}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
        {isSignUp ? 'Create account' : 'Continue'}
        {!submitting ? <ArrowRight className="size-4" /> : null}
      </Button>

      <p className="text-center text-2xs text-muted-foreground">
        {isSignUp ? 'Already have an account? ' : 'New here? '}
        <Link
          href={isSignUp ? '/sign-in' : '/sign-up'}
          className="font-medium text-foreground underline underline-offset-2"
        >
          {isSignUp ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </form>
  )
}
