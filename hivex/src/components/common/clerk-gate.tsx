import { ClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

import { CLERK_PUBLISHABLE_KEY, isClerkEnabled } from '@/lib/auth/authMode'

/**
 * Mounts ClerkProvider only when a publishable key exists.
 *
 * `@clerk/nextjs` throws at render if it is mounted without a key, which would
 * make the demo unrunnable for anyone who has not been given credentials. The
 * fallback path is a local demo identity — see lib/state/identity-provider.
 */
export function ClerkGate({ children }: { children: ReactNode }) {
  if (!isClerkEnabled) return <>{children}</>

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary: '#c53d0d',
          borderRadius: '0.625rem',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
