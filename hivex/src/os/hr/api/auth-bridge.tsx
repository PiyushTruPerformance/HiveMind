'use client'

import { useEffect } from 'react'

import { useIdentity } from '@/lib/state/identity-provider'

import { setHrAuthTokenGetter } from './client'

/**
 * Hands the HR OS API client a token getter.
 *
 * Same pattern as the standalone app's ClerkApiBridge, but sourced from the
 * platform's identity layer instead of Clerk directly — so the API client works
 * unchanged whether the platform is running on Clerk or on the demo identity,
 * and `services/hr-os` sees either a real bearer token or none (its documented
 * dev-bypass).
 */
export function HrApiAuthBridge() {
  const { getToken } = useIdentity()

  useEffect(() => {
    setHrAuthTokenGetter(getToken)
    return () => setHrAuthTokenGetter(null)
  }, [getToken])

  return null
}
