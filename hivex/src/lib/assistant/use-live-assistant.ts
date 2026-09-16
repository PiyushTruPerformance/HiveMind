'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useToast } from '@/components/ui/toast'
import { useIdentity } from '@/lib/state/identity-provider'
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/utils/storage'
import type { AssistantActionStatus, AssistantMessage } from '@/platform/types'

import {
  AskTruApiError,
  askTruApi,
  askTruErrorMessage,
  type ChatMessage,
  type ChatSession,
  type ChatSocketEvent,
} from './api'
import { useChatSocket, type SocketStatus } from './use-chat-socket'

/**
 * Ask Tru against the live Tru Reporting AI service.
 *
 * Behaviour ported from Reporting OS `lib/hooks/useUniversalChat.ts`:
 *
 *   send → (create session if none) → POST /message records the user turn
 *        → the service answers in the background and pushes the reply over
 *          the WebSocket → the reply is merged into the cached thread.
 *
 * Differences, each deliberate:
 *   - A missing or unapproved profile is reported in the panel rather than
 *     failing silently.
 *   - While a reply is pending the thread is also polled. The socket is the
 *     fast path; polling guarantees a reply still lands if the socket drops.
 *   - A reply that never arrives times out with a visible error rather than
 *     leaving the composer locked.
 *   - Failures surface through the HiveX toast system, never silently.
 */

const REPLY_POLL_MS = 4_000
const REPLY_TIMEOUT_MS = 120_000

const norm = (id: string) => String(id).toLowerCase()

/** True when an assistant turn follows the given user message in the thread. */
function hasReplyAfter(thread: ChatMessage[] | undefined, userMessageId: string): boolean {
  if (!thread) return false
  const index = thread.findIndex((m) => norm(m.id) === norm(userMessageId))
  return index >= 0 && thread.slice(index + 1).some((m) => m.role === 'assistant')
}

export const askTruKeys = {
  all: ['ask-tru'] as const,
  profile: () => [...askTruKeys.all, 'profile'] as const,
  workspaces: () => [...askTruKeys.all, 'workspaces'] as const,
  sessions: (accountId: string) => [...askTruKeys.all, 'sessions', norm(accountId)] as const,
  messages: (sessionId: string) => [...askTruKeys.all, 'messages', norm(sessionId)] as const,
}

const ACTION_STATUSES: AssistantActionStatus[] = ['proposed', 'sent', 'failed', 'empty']

function toAssistantMessage(message: ChatMessage): AssistantMessage {
  const content = message.content ?? ''
  const isAssistant = message.role === 'assistant'
  // The service stores the literal "error" when its AI pipeline throws.
  const failed = isAssistant && content.trim().toLowerCase() === 'error'
  const empty = isAssistant && !failed && content.trim().length === 0 && !message.action_id

  const status = ACTION_STATUSES.includes(message.action_status as AssistantActionStatus)
    ? (message.action_status as AssistantActionStatus)
    : 'proposed'

  return {
    id: message.id,
    role: message.role,
    content: failed ? '' : content,
    createdAt: message.created_at,
    error: failed
      ? 'Ask Tru could not complete that request. Try again in a moment.'
      : empty
        ? 'Ask Tru returned an empty response. Try rephrasing your question.'
        : undefined,
    action: message.action_id ? { id: message.action_id, status, content } : undefined,
  }
}

export interface LiveAssistant {
  /** False until the signed-in user's account id has been resolved. */
  ready: boolean
  /** Why the live assistant cannot be used, when it cannot. */
  setupError: string | null
  sessions: ChatSession[]
  activeSessionId: string | null
  selectSession: (id: string | null) => void
  messages: AssistantMessage[]
  isLoadingHistory: boolean
  isStreaming: boolean
  send: (content: string) => Promise<boolean>
  rename: (sessionId: string, name: string) => Promise<void>
  remove: (sessionId: string) => Promise<void>
  confirmAction: (actionId: string, editedContent?: string) => Promise<boolean>
  confirmingActionId: string | null
  socketStatus: SocketStatus
}

export function useLiveAssistant(enabled: boolean): LiveAssistant {
  const qc = useQueryClient()
  const toast = useToast()
  const identity = useIdentity()
  const { getToken } = identity

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<{ sessionId: string; afterMessageId: string; since: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null)
  const [activity, setActivity] = useState<Record<string, number>>({})
  const submittingRef = useRef(false)
  /* Read by send(): callers may pick a session and send in the same tick
     (the home launcher starts a new conversation, then sends into it). */
  const activeSessionRef = useRef<string | null>(null)

  /* ---------------- identity ---------------- */

  const profileQuery = useQuery({
    queryKey: askTruKeys.profile(),
    enabled: enabled && identity.isLoaded && identity.isSignedIn,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const token = await getToken()
      if (!token) throw new AskTruApiError(401, 'Your session has expired. Sign in again to use Ask Tru.')
      return askTruApi.getCurrentProfile(token)
    },
  })
  const accountId = profileQuery.data?.id ?? null
  const profile = profileQuery.data

  /* Connector actions resolve integrations per workspace — the first visible
     one, exactly as Reporting OS does. Optional: chat works without it. */
  const workspacesQuery = useQuery({
    queryKey: askTruKeys.workspaces(),
    enabled: enabled && profile?.status === 'approved' && Boolean(profile?.company_id),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const token = await getToken()
      return token ? askTruApi.listWorkspaces(token) : []
    },
  })
  const workspaceId = workspacesQuery.data?.[0]?.id

  const setupError = useMemo(() => {
    if (!enabled) return null
    if (identity.isLoaded && !identity.isSignedIn) return 'Sign in to use Ask Tru.'
    const error = profileQuery.error
    if (error instanceof AskTruApiError && error.status === 404) {
      return 'Your Tru profile was not found. Finish onboarding in Tru Reporting, then reload.'
    }
    if (error instanceof AskTruApiError && error.status === 401) {
      return 'Your session could not be verified. Sign out and sign in again to use Ask Tru.'
    }
    if (error) return askTruErrorMessage(error)
    return null
  }, [enabled, identity.isLoaded, identity.isSignedIn, profileQuery.error])

  /* ---------------- active session ---------------- */

  useEffect(() => {
    if (!enabled) return
    const stored = readStorage<string | null>(STORAGE_KEYS.askTruSession, null)
    activeSessionRef.current = stored
    setActiveSessionId(stored)
  }, [enabled])

  const selectSession = useCallback((id: string | null) => {
    activeSessionRef.current = id
    setActiveSessionId(id)
    writeStorage(STORAGE_KEYS.askTruSession, id)
  }, [])

  const touch = useCallback((sessionId: string) => {
    setActivity((prev) => ({ ...prev, [norm(sessionId)]: Date.now() }))
  }, [])

  /* ---------------- sessions ---------------- */

  const sessionsQuery = useQuery({
    queryKey: askTruKeys.sessions(accountId ?? ''),
    enabled: enabled && Boolean(accountId),
    queryFn: () => askTruApi.listSessions(accountId!),
  })

  const sessions = useMemo(() => {
    const list = sessionsQuery.data ?? []
    const at = (s: ChatSession) => activity[norm(s.id)] ?? new Date(s.created_at).getTime()
    return [...list].sort((a, b) => at(b) - at(a))
  }, [sessionsQuery.data, activity])

  useEffect(() => {
    if (sessionsQuery.error) toast.error('Could not load conversations', askTruErrorMessage(sessionsQuery.error))
  }, [sessionsQuery.error, toast])

  /* A persisted session that is not this account's (deleted, or another
     user's browser state) is dropped rather than fetched. */
  useEffect(() => {
    if (!activeSessionId || !sessionsQuery.isSuccess) return
    if (!sessionsQuery.data.some((s) => norm(s.id) === norm(activeSessionId))) selectSession(null)
  }, [activeSessionId, sessionsQuery.isSuccess, sessionsQuery.data, selectSession])

  /* ---------------- messages ---------------- */

  const isWaitingHere = Boolean(waiting && activeSessionId && norm(waiting.sessionId) === norm(activeSessionId))

  const messagesQuery = useQuery({
    queryKey: askTruKeys.messages(activeSessionId ?? ''),
    enabled: enabled && Boolean(accountId) && Boolean(activeSessionId),
    queryFn: () => askTruApi.listMessages(activeSessionId!),
    refetchInterval: isWaitingHere ? REPLY_POLL_MS : false,
    retry: (count, error) => !(error instanceof AskTruApiError && error.status === 404) && count < 1,
  })

  useEffect(() => {
    const error = messagesQuery.error
    if (!error) return
    if (error instanceof AskTruApiError && error.status === 404) {
      selectSession(null)
      return
    }
    toast.error('Could not load messages', askTruErrorMessage(error))
  }, [messagesQuery.error, selectSession, toast])

  /* The reply landed (via socket or poll) — stop waiting. */
  useEffect(() => {
    if (!waiting) return
    const thread = qc.getQueryData<ChatMessage[]>(askTruKeys.messages(waiting.sessionId))
    if (hasReplyAfter(thread, waiting.afterMessageId)) {
      setWaiting(null)
      void qc.invalidateQueries({ queryKey: askTruKeys.sessions(accountId ?? '') })
    }
  }, [waiting, messagesQuery.data, qc, accountId])

  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => {
      setWaiting(null)
      toast.error('Ask Tru did not respond', 'No reply arrived in time. Try sending your message again.')
    }, REPLY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [waiting, toast])

  const messages = useMemo(() => {
    const mapped = (messagesQuery.data ?? []).map(toAssistantMessage)
    if (isWaitingHere) {
      mapped.push({
        id: 'ask-tru-pending',
        role: 'assistant',
        content: '',
        createdAt: new Date(waiting!.since).toISOString(),
        streaming: true,
      })
    }
    return mapped
  }, [messagesQuery.data, isWaitingHere, waiting])

  /* ---------------- socket ---------------- */

  const handleEvent = useCallback(
    (event: ChatSocketEvent) => {
      if (event.event === 'new_chat_message') {
        const incoming = event.data
        if (!incoming?.session_id || !incoming.id) return
        const key = askTruKeys.messages(incoming.session_id)
        const reply =
          incoming.action_id && !incoming.action_status ? { ...incoming, action_status: 'proposed' } : incoming

        if (qc.getQueryData(key) === undefined) {
          void qc.invalidateQueries({ queryKey: key })
        } else {
          qc.setQueryData<ChatMessage[]>(key, (old = []) =>
            old.some((m) => norm(m.id) === norm(reply.id)) ? old : [...old, reply],
          )
        }
        setWaiting((current) =>
          current && norm(current.sessionId) === norm(incoming.session_id) ? null : current,
        )
        if (accountId) void qc.invalidateQueries({ queryKey: askTruKeys.sessions(accountId) })
        return
      }

      if (event.event === 'session_renamed') {
        const { session_id, session_name } = event.data ?? {}
        if (!session_id || !session_name || !accountId) return
        qc.setQueryData<ChatSession[]>(askTruKeys.sessions(accountId), (old = []) =>
          old.map((s) => (norm(s.id) === norm(session_id) ? { ...s, session_name } : s)),
        )
      }
    },
    [qc, accountId],
  )

  const socketStatus = useChatSocket({
    accountId: enabled ? accountId : null,
    getToken,
    onEvent: handleEvent,
    onReconnect: () => {
      // Anything pushed while disconnected is only in the database now.
      void qc.invalidateQueries({ queryKey: [...askTruKeys.all, 'messages'] })
      if (accountId) void qc.invalidateQueries({ queryKey: askTruKeys.sessions(accountId) })
    },
  })

  /* ---------------- send ---------------- */

  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const content = raw.trim()
      if (!content || submittingRef.current) return false
      if (!accountId) {
        toast.error('Ask Tru is not ready', setupError ?? 'Your profile is still loading — try again in a moment.')
        return false
      }

      submittingRef.current = true
      setIsSubmitting(true)
      let sessionId = activeSessionRef.current
      const tempId = `temp-${Date.now()}`

      try {
        if (!sessionId) {
          const name = content.length > 30 ? `${content.slice(0, 30)}…` : content
          const session = await askTruApi.createSession(accountId, name)
          sessionId = session.id
          qc.setQueryData<ChatSession[]>(askTruKeys.sessions(accountId), (old = []) => [
            session,
            ...old.filter((s) => norm(s.id) !== norm(session.id)),
          ])
          qc.setQueryData<ChatMessage[]>(askTruKeys.messages(session.id), [])
          selectSession(session.id)
        }

        const target = sessionId
        touch(target)
        await qc.cancelQueries({ queryKey: askTruKeys.messages(target) })
        const sentAt = Date.now()
        qc.setQueryData<ChatMessage[]>(askTruKeys.messages(target), (old = []) => [
          ...old,
          { id: tempId, session_id: target, role: 'user', content, created_at: new Date().toISOString() },
        ])

        const saved = await askTruApi.sendMessage({ sessionId: target, content, accountId, workspaceId })

        // Replace the optimistic turn in place, so a reply that raced ahead keeps its order.
        qc.setQueryData<ChatMessage[]>(askTruKeys.messages(target), (old = []) => {
          if (old.some((m) => norm(m.id) === norm(saved.id))) return old.filter((m) => m.id !== tempId)
          return old.map((m) => (m.id === tempId ? saved : m))
        })

        const replied = hasReplyAfter(qc.getQueryData<ChatMessage[]>(askTruKeys.messages(target)), saved.id)
        if (!replied) setWaiting({ sessionId: target, afterMessageId: saved.id, since: sentAt })
        return true
      } catch (error) {
        if (sessionId) {
          qc.setQueryData<ChatMessage[]>(askTruKeys.messages(sessionId), (old = []) =>
            old.filter((m) => m.id !== tempId),
          )
        }
        if (error instanceof AskTruApiError && error.status === 404) {
          selectSession(null)
          toast.error('Conversation expired', 'That conversation no longer exists. Send your message again to start a new one.')
        } else {
          toast.error('Message not sent', askTruErrorMessage(error))
        }
        return false
      } finally {
        submittingRef.current = false
        setIsSubmitting(false)
      }
    },
    [accountId, qc, selectSession, setupError, toast, touch, workspaceId],
  )

  /* ---------------- session management ---------------- */

  const renameMutation = useMutation({
    mutationFn: ({ sessionId, name }: { sessionId: string; name: string }) =>
      askTruApi.renameSession(sessionId, accountId!, name),
    onMutate: async ({ sessionId, name }) => {
      const key = askTruKeys.sessions(accountId!)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ChatSession[]>(key)
      qc.setQueryData<ChatSession[]>(key, (old = []) =>
        old.map((s) => (norm(s.id) === norm(sessionId) ? { ...s, session_name: name } : s)),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(askTruKeys.sessions(accountId!), context.previous)
      toast.error('Rename failed', askTruErrorMessage(error))
    },
    onSettled: () => {
      if (accountId) void qc.invalidateQueries({ queryKey: askTruKeys.sessions(accountId) })
    },
  })

  const renameSession = renameMutation.mutateAsync
  const rename = useCallback(
    async (sessionId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed || !accountId) return
      await renameSession({ sessionId, name: trimmed }).catch(() => undefined)
    },
    [accountId, renameSession],
  )

  const remove = useCallback(
    async (sessionId: string) => {
      if (!accountId) return
      try {
        await askTruApi.deleteSession(sessionId)
        qc.setQueryData<ChatSession[]>(askTruKeys.sessions(accountId), (old = []) =>
          old.filter((s) => norm(s.id) !== norm(sessionId)),
        )
        qc.removeQueries({ queryKey: askTruKeys.messages(sessionId) })
        if (activeSessionId && norm(activeSessionId) === norm(sessionId)) selectSession(null)
        setWaiting((current) => (current && norm(current.sessionId) === norm(sessionId) ? null : current))
        toast.success('Conversation deleted')
      } catch (error) {
        toast.error('Could not delete the conversation', askTruErrorMessage(error))
      }
    },
    [accountId, activeSessionId, qc, selectSession, toast],
  )

  /* ---------------- connector actions ---------------- */

  const confirmAction = useCallback(
    async (actionId: string, editedContent?: string): Promise<boolean> => {
      setConfirmingActionId(actionId)
      try {
        const token = await getToken()
        await askTruApi.confirmAction(token, actionId, editedContent)
        if (activeSessionId) {
          qc.setQueryData<ChatMessage[]>(askTruKeys.messages(activeSessionId), (old = []) =>
            old.map((m) => (m.action_id && norm(m.action_id) === norm(actionId) ? { ...m, action_status: 'sent' } : m)),
          )
        }
        toast.success('Action sent')
        return true
      } catch (error) {
        toast.error('Action not sent', askTruErrorMessage(error))
        // The service may have recorded the failure; show its real status.
        if (activeSessionId) void qc.invalidateQueries({ queryKey: askTruKeys.messages(activeSessionId) })
        return false
      } finally {
        setConfirmingActionId(null)
      }
    },
    [activeSessionId, getToken, qc, toast],
  )

  const isLoadingHistory = messagesQuery.isLoading
  const isStreaming = isSubmitting || isWaitingHere

  return useMemo(
    () => ({
      ready: Boolean(accountId),
      setupError,
      sessions,
      activeSessionId,
      selectSession,
      messages,
      isLoadingHistory,
      isStreaming,
      send,
      rename,
      remove,
      confirmAction,
      confirmingActionId,
      socketStatus,
    }),
    [
      accountId,
      setupError,
      sessions,
      activeSessionId,
      selectSession,
      messages,
      isLoadingHistory,
      isStreaming,
      send,
      rename,
      remove,
      confirmAction,
      confirmingActionId,
      socketStatus,
    ],
  )
}
