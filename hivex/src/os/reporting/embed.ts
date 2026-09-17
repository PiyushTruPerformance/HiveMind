/**
 * TEMPORARY REPORTING OS EMBED — configuration.
 *
 * While this is in place, Reporting OS product pages render the deployed Tru
 * Reporting OS application in an iframe instead of the native HiveX views in
 * `./views.tsx`. The native implementation is untouched and is restored by
 * removing the embed branch in `src/app/app/os/[osId]/layout.tsx` (or simply
 * unsetting NEXT_PUBLIC_REPORTING_OS_URL, which falls back to native).
 *
 * The URL lives here and nowhere else.
 */

export const REPORTING_OS_EMBED_URL = (process.env.NEXT_PUBLIC_REPORTING_OS_URL?.trim() ?? '').replace(/\/+$/, '')

export const isReportingOSEmbedded = REPORTING_OS_EMBED_URL.length > 0

/**
 * Reporting OS sections that stay native while embedded.
 *
 * The purchase funnel (about, pricing, checkout, setup) is platform-owned and
 * never reaches this check. Ask Tru and Integrations are platform features that
 * happen to be mounted under the product's URL space, so they keep rendering
 * natively; everything else — the overview, the workspace list and every
 * workspace page — is the Reporting OS product itself and is embedded.
 */
const NATIVE_SECTIONS = new Set(['assistant', 'integrations'])

export function isEmbeddedReportingSection(section: string): boolean {
  return isReportingOSEmbedded && !NATIVE_SECTIONS.has(section)
}

/** Funnel pages live under the product's URL space but are platform pages. */
const FUNNEL_SECTIONS = new Set(['about', 'pricing', 'checkout', 'setup'])

/**
 * Whether a pathname is a Reporting OS page that renders the embed.
 *
 * Mirrors the branch in `src/app/app/os/[osId]/layout.tsx`, from the URL alone,
 * so the app shell can give the embed the full content area on direct loads and
 * refreshes as well as client-side navigation.
 */
export function isEmbeddedReportingPath(pathname: string): boolean {
  const [, app, os, osId, section = ''] = pathname.split('/')
  return (
    app === 'app' &&
    os === 'os' &&
    osId === 'reporting' &&
    !FUNNEL_SECTIONS.has(section) &&
    isEmbeddedReportingSection(section)
  )
}
