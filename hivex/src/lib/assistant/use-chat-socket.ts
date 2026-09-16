'use client'

import { useEffect, useRef, useState } from 'react'

import { aiWsUrl } from '@/lib/api/config'

import type { ChatSocketEvent } from './api'

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting'

/**
 * The Ask Tru WebSocket.
 *
 * Ported from Reporting OS `hooks/useWebsocket.ts`: one connection per account,
 * `{base}/universal-chat/ws/{accountId}?token={clerkJwt}`, reconnecting with a
 * fresh token whenever it drops. The service pushes each finished assistant
 * reply (`new_chat_message`) and generated titles (`session_renamed`) here —
 * the HTTP send only records the user's message.
 *
 * Mounted once, from the assistant provider, so the app never holds two
 * sockets. Backoff grows to 30s so an unreachable service is not hammered.
 */
export function useChatSocket({
  accountId,
  getToken,
  onEvent,
  onReconnect,
}: {
  accountId: string | null
  getToken: () => Promise<string | null>
  onEvent: (event: ChatSocketEvent) => void
  /** Fires on every successful open after the first — events may have been missed. */
  onReconnect?: () => void
}): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>('idle')

  // Latest callbacks, so a re-render never tears the socket down.
  const onEventRef = useRef(onEvent)
  const onReconnectRef = useRef(onReconnect)
  const getTokenRef = useRef(getToken)
  onEventRef.current = onEvent
  onReconnectRef.current = onReconnect
  getTokenRef.current = getToken

  useEffect(() => {
    if (!accountId) {
      setStatus('idle')
      return
    }

    let socket: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let hasOpened = false
    let disposed = false

    const scheduleReconnect = () => {
      if (disposed) return
      attempts += 1
      setStatus('reconnecting')
      const delay = Math.min(30_000, 1_500 * 2 ** Math.min(attempts - 1, 5))
      timer = setTimeout(() => void connect(), delay)
    }

    const connect = async () => {
      if (disposed) return
      setStatus(hasOpened ? 'reconnecting' : 'connecting')

      let url: string
      try {
        const token = await getTokenRef.current()
        if (disposed) return
        url = aiWsUrl(`/universal-chat/ws/${encodeURIComponent(accountId)}`)
        if (token) url += `?token=${encodeURIComponent(token)}`
      } catch (error) {
        console.error('[ask-tru] socket setup failed', error)
        scheduleReconnect()
        return
      }

      try {
        socket = new WebSocket(url)
      } catch (error) {
        console.error('[ask-tru] socket could not be created', error)
        scheduleReconnect()
        return
      }

      socket.onopen = () => {
        if (disposed) return
        attempts = 0
        setStatus('open')
        if (hasOpened) onReconnectRef.current?.()
        hasOpened = true
      }

      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(String(message.data)) as ChatSocketEvent
          if (parsed && typeof parsed === 'object' && 'event' in parsed) {
            onEventRef.current(parsed)
          }
        } catch (error) {
          console.warn('[ask-tru] ignored a malformed socket message', error)
        }
      }

      socket.onerror = () => {
        // The browser already logs the network failure; close → onclose reconnects.
        socket?.close()
      }

      socket.onclose = () => {
        socket = null
        scheduleReconnect()
      }
    }

    void connect()

    return () => {
      disposed = true
      clearTimeout(timer)
      if (socket) {
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        socket.close()
      }
      setStatus('idle')
    }
  }, [accountId])

  return status
}
