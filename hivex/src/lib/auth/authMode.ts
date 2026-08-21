/**
 * Authentication mode.
 *
 * The platform targets Clerk, exactly as the Reporting OS does. But the demo
 * has to run for someone who has not been handed keys, so Clerk is mounted only
 * when a publishable key is present; otherwise the app uses a local demo
 * identity. This is the same fallback the CV Analyzer documents
 * ("If you left the Clerk key blank, it skips straight to the dashboard").
 *
 * Nothing else in the codebase reads process.env for auth — components ask
 * `useIdentity()`, which resolves from whichever mode is active.
 */

export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''

export const isClerkEnabled = CLERK_PUBLISHABLE_KEY.length > 0

export const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in'
export const SIGN_UP_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up'
