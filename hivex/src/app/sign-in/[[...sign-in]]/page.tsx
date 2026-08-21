import type { Metadata } from 'next'

import { AuthPanel } from '@/components/common/auth-panel'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return <AuthPanel mode="sign-in" />
}
