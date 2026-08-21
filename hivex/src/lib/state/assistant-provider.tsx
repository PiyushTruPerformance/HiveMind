'use client'

import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { OS_REGISTRY, isOSId } from '@/platform/config/os-registry'
import { ASK_TRU_PLATFORM_SUGGESTIONS, isAskTruAvailable } from '@/platform/config/ask-tru'
import type { AssistantContext, AssistantMessage, Conversation, OSId, Workspace } from '@/platform/types'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { DEMO_CONVERSATIONS } from '@/lib/mock/data/conversations'
import { assistantService, type AssistantScope } from '@/lib/mock/services/assistantService'
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/utils/storage'

/**
 * Ask Tru — assistant state.
 *
 * Two design points matter here beyond bookkeeping:
 *
 *  1. **Context follows the route.** The active scope is derived from the
 *     pathname, so opening the assistant anywhere already knows whether you are
 *     on the platform home, inside an OS, or inside a workspace. No screen has
 *     to remember to tell it.
 *  2. **Scope is passed, not inferred.** Every request carries the caller's
 *     accessible OS list and workspace ids. The mock service honours it today;
 *     the production backend will enforce it. The contract does not change.
 */

interface AssistantValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void

  context: AssistantContext
  conversations: Conversation[]
  activeConversation: Conversation | null
  activeId: string | null
  selectConversation: (id: string | null) => void
  startNewConversation: () => void

  isStreaming: boolean
  send: (prompt: string) => Promise<void>
  suggestions: string[]
  /** False on client-specific pages, where Ask Tru is not offered at all. */
  available: boolean
  /** Conversations recorded in the current scope, newest first. */
  scopedConversations: Conversation[]
}

const AssistantCtx = createContext<AssistantValue | null>(null)

/**
 * Derives the assistant scope from the current URL.
 *
 * Workspaces are passed in rather than looked up from fixtures — HR OS loads
 * its workspaces from a service, so the scope label has to read live state.
 */
function contextFromPath(
  pathname: string,
  workspaces: Record<OSId, Workspace[]>,
): AssistantContext {
  const parts = pathname.split('/').filter(Boolean) // ['app', 'os', 'reporting', 'w', 'ws_x', ...]
  const osIndex = parts.indexOf('os')
  const rawOs = osIndex >= 0 ? parts[osIndex + 1] : undefined

  if (!isOSId(rawOs)) {
    return {
      kind: 'platform',
      label: 'All products',
      dataSources: ['GA4', 'Search Console', 'Google Ads', 'Outreach records', 'Applications'],
    }
  }

  const os = OS_REGISTRY[rawOs as OSId]
  const wIndex = parts.indexOf('w', osIndex)
  const workspaceId = wIndex >= 0 ? parts[wIndex + 1] : undefined

  if (workspaceId) {
    const workspace = (workspaces[os.id] ?? []).find((w) => w.id === workspaceId)
    return {
      kind: 'workspace',
      osId: os.id,
      workspaceId,
      label: `${os.name} · ${workspace?.name ?? 'Workspace'}`,
      dataSources: os.assistant.dataSources,
    }
  }

  return {
    kind: 'os',
    osId: os.id,
    label: os.name,
    dataSources: os.assistant.dataSources,
  }
}

let messageCounter = 0
const nextId = (prefix: string) => {
  messageCounter += 1
  return `${prefix}_${messageCounter}_${Math.round(performance.now())}`
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/'
  const access = useAccess()
  const { workspaces } = usePlatform()

  const [open, setOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>(DEMO_CONVERSATIONS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const stored = readStorage<Conversation[] | null>(STORAGE_KEYS.conversations, null)
    if (stored && stored.length > 0) setConversations(stored)
  }, [])

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
    },
    [],
  )

  const context = useMemo(
    () => contextFromPath(pathname, workspaces),
    [pathname, workspaces],
  )

  const available = useMemo(
    () => isAskTruAvailable({ kind: context.kind, osId: context.osId }),
    [context.kind, context.osId],
  )

  /* Changing scope closes the open thread: an answer from another scope must
     not appear to belong to the one you are now looking at. */
  useEffect(() => {
    setActiveId(null)
  }, [context.label])

  /* Navigating into a client page must dismiss the dock, not leave it hanging
     over a surface where Ask Tru is not offered. */
  useEffect(() => {
    if (!available) setOpen(false)
  }, [available])

  const scope = useMemo<AssistantScope>(() => {
    const accessibleWorkspaces: Partial<Record<OSId, string[]>> = {}
    access.accessibleOS.forEach((osId) => {
      accessibleWorkspaces[osId] = access.workspacesIn(osId).map((w) => w.id)
    })
    return {
      accessibleOS: access.accessibleOS,
      accessibleWorkspaces,
      crossOSAllowed: access.accountAllows('crossOSAssistant'),
    }
  }, [access])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const scopedConversations = useMemo(
    () => conversations.filter((c) => c.context.label === context.label),
    [conversations, context.label],
  )

  const suggestions = useMemo(() => {
    if (context.kind === 'platform') return [...ASK_TRU_PLATFORM_SUGGESTIONS]
    const os = context.osId ? OS_REGISTRY[context.osId] : null
    return os ? [...os.assistant.suggestions] : [...ASK_TRU_PLATFORM_SUGGESTIONS]
  }, [context])

  const startNewConversation = useCallback(() => setActiveId(null), [])

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim()
      if (!trimmed || isStreaming) return

      const now = new Date().toISOString()
      const userMessage: AssistantMessage = {
        id: nextId('msg'),
        role: 'user',
        content: trimmed,
        createdAt: now,
      }
      const assistantId = nextId('msg')
      const placeholder: AssistantMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: now,
        streaming: true,
      }

      /* The conversation id is resolved BEFORE the updater runs. Deriving it
         inside `setConversations` would make the updater impure, and React's
         development double-invoke would then take the "existing conversation"
         branch on the second pass and silently drop the message. */
      const isNewThread = !activeId
      const conversationId = activeId ?? nextId('conv')

      setConversations((prev) => {
        if (!isNewThread) {
          return prev.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, userMessage, placeholder], updatedAt: now }
              : c,
          )
        }
        if (prev.some((c) => c.id === conversationId)) return prev
        const created: Conversation = {
          id: conversationId,
          title: assistantService.titleFor(trimmed),
          context,
          messages: [userMessage, placeholder],
          createdAt: now,
          updatedAt: now,
        }
        return [created, ...prev]
      })
      setActiveId(conversationId)
      setIsStreaming(true)

      const patch = (updater: (message: AssistantMessage) => AssistantMessage) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? updater(m) : m)) }
              : c,
          ),
        )
      }

      try {
        const reply = await assistantService.respond(trimmed, context, scope)
        const tokens = reply.content.split(/(\s+)/)
        let index = 0

        await new Promise<void>((resolve) => {
          const tick = () => {
            const chunk = tokens.slice(index, index + 3).join('')
            index += 3
            patch((m) => ({ ...m, content: m.content + chunk }))
            if (index < tokens.length) {
              const t = setTimeout(tick, 16)
              timers.current.push(t)
            } else {
              patch((m) => ({
                ...m,
                streaming: false,
                citations: reply.citations,
                permissionNotice: reply.permissionNotice,
              }))
              resolve()
            }
          }
          const t = setTimeout(tick, 120)
          timers.current.push(t)
        })
      } catch {
        patch((m) => ({
          ...m,
          streaming: false,
          error: 'The assistant could not complete that request. Try again in a moment.',
        }))
      } finally {
        setIsStreaming(false)
        setConversations((prev) => {
          writeStorage(STORAGE_KEYS.conversations, prev.slice(0, 20))
          return prev
        })
      }
    },
    [activeId, context, isStreaming, scope],
  )

  const value = useMemo<AssistantValue>(
    () => ({
      open: open && available,
      setOpen: (next: boolean) => setOpen(next && available),
      toggle: () => setOpen((o) => !o && available),
      available,
      context,
      conversations,
      activeConversation,
      activeId,
      selectConversation: setActiveId,
      startNewConversation,
      isStreaming,
      send,
      suggestions,
      scopedConversations,
    }),
    [
      open,
      available,
      context,
      conversations,
      activeConversation,
      activeId,
      startNewConversation,
      isStreaming,
      send,
      suggestions,
      scopedConversations,
    ],
  )

  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>
}

export function useAssistant(): AssistantValue {
  const ctx = useContext(AssistantCtx)
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>')
  return ctx
}
