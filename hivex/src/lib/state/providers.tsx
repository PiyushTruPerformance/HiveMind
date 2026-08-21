'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { useState, type ReactNode } from 'react'

import { ConfirmProvider } from '@/components/ui/confirm'
import { ToastProvider } from '@/components/ui/toast'

import { HrApiAuthBridge } from '@/os/hr/api/auth-bridge'

import { AssistantProvider } from './assistant-provider'
import { IdentityProvider } from './identity-provider'
import { PlatformProvider } from './platform-provider'
import { ThemeProvider } from './theme-provider'

/**
 * Root context composition, in dependency order:
 *
 *   Theme      → no dependencies
 *   Query      → server-state cache (kept for when the mock services become
 *                real endpoints; the mock layer already returns promises)
 *   Identity   → Clerk or demo
 *   Platform   → organization, plan, membership, connections
 *   Assistant  → needs access, which needs Platform
 *   Toast      → leaf, needed by everything above it in the tree
 *   Confirm    → leaf, same reason
 *
 * HrApiAuthBridge is not a provider: it hands the HR OS API client a way to
 * fetch a session token, so that client never has to import Clerk itself.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  )

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250} skipDelayDuration={300}>
          <ToastProvider>
            <ConfirmProvider>
              <IdentityProvider>
                <HrApiAuthBridge />
                <PlatformProvider>
                  <AssistantProvider>{children}</AssistantProvider>
                </PlatformProvider>
              </IdentityProvider>
            </ConfirmProvider>
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
