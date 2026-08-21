'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAuth, useUser, useClerk } from '@clerk/nextjs'

import { isClerkEnabled } from '@/lib/auth/authMode'
import { DEMO_USER } from '@/lib/mock/data/organization'
import type { PlatformUser } from '@/platform/types'

/**
 * Identity resolution.
 *
 * Two implementations, one contract. The rest of the application only ever
 * calls `useIdentity()` and does not know or care which one is mounted.
 *
 * `isClerkEnabled` is a build-time constant (an inlined NEXT_PUBLIC_ env var),
 * so the branch below is fixed for the lifetime of the bundle — the two bridge
 * components never swap places at runtime.
 */

interface IdentityValue {
  user: PlatformUser
  isLoaded: boolean
  isSignedIn: boolean
  mode: 'clerk' | 'demo'
  signOut: () => void
  /**
   * Session token for calls to platform services (the HR OS API verifies it
   * with Clerk's JWKS). Resolves to null in demo mode, which the services
   * accept via their documented dev-bypass.
   */
  getToken: () => Promise<string | null>
}

const IdentityContext = createContext<IdentityValue | null>(null)

function ClerkIdentityBridge({ children }: { children: ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser()
  const { getToken } = useAuth()
  const clerk = useClerk()

  const resolveToken = useCallback(async () => {
    try {
      return await getToken()
    } catch {
      return null
    }
  }, [getToken])

  const value = useMemo<IdentityValue>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      mode: 'clerk',
      signOut: () => void clerk.signOut(),
      getToken: resolveToken,
      user: user
        ? {
            id: user.id,
            clerkId: user.id,
            name: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'Member',
            email: user.primaryEmailAddress?.emailAddress ?? '',
            avatarUrl: user.imageUrl,
          }
        : DEMO_USER,
    }),
    [user, isLoaded, isSignedIn, clerk, resolveToken],
  )

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

function DemoIdentityBridge({ children }: { children: ReactNode }) {
  const value = useMemo<IdentityValue>(
    () => ({
      user: DEMO_USER,
      isLoaded: true,
      isSignedIn: true,
      mode: 'demo',
      getToken: async () => null,
      signOut: () => {
        if (typeof window !== 'undefined') window.location.href = '/'
      },
    }),
    [],
  )
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const Bridge = isClerkEnabled ? ClerkIdentityBridge : DemoIdentityBridge
  return <Bridge>{children}</Bridge>
}

export function useIdentity(): IdentityValue {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be used inside <IdentityProvider>')
  return ctx
}
