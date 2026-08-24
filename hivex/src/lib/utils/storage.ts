/**
 * Namespaced localStorage helpers.
 *
 * The demo persists the onboarding result and a little UI state so a client
 * walkthrough survives a page refresh. Everything here is SSR-safe and fails
 * closed: a blocked or full storage never throws into the render path.
 */

const NAMESPACE = 'hivex'

export function storageKey(key: string): string {
  return `${NAMESPACE}:${key}`
}

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(storageKey(key))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    /* quota or privacy mode — the demo degrades to in-memory state */
  }
}

export function clearStorage(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(key))
  } catch {
    /* ignore */
  }
}

export function clearAllPlatformStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(`${NAMESPACE}:`)) doomed.push(key)
    }
    doomed.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  subscriptions: 'subscriptions',
  organization: 'organization',
  accounts: 'integration-accounts',
  resources: 'integration-resources',
  mappings: 'integration-mappings',
  recents: 'recents',
  favorites: 'favorites',
  conversations: 'conversations',
  theme: 'theme',
  identity: 'identity',
  railCollapsed: 'rail-collapsed',
} as const
