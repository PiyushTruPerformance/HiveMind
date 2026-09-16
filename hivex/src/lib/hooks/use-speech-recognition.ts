'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Voice input for Ask Tru — a thin hook around the browser Web Speech API.
 *
 * Ported from Reporting OS `hooks/useSpeechRecognition.ts`:
 *   - `onFinalTranscript` receives only the newest finalised chunk, so the
 *     composer can append it without re-appending earlier speech.
 *   - `interimTranscript` is the live guess, for a preview while speaking.
 *   - Chrome ends continuous recognition after ~60s regardless of settings; the
 *     hook restarts transparently while the user still wants to listen.
 *   - `no-speech` and `aborted` are normal and never surfaced; permission
 *     errors stop listening and produce a readable message.
 *
 * The recogniser types are declared locally: TypeScript's DOM lib ships the
 * result types but not the recogniser itself.
 */

interface RecognitionResultEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface RecognitionErrorEvent {
  error: string
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const UNSUPPORTED = "Voice input isn't supported in this browser. Try Chrome, Edge or Safari."

function humaniseError(code: string): string | null {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return null
    case 'audio-capture':
      return 'No microphone was found. Check your input device.'
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied. Allow it in your browser settings and try again.'
    case 'network':
      return 'The speech recognition service could not be reached. Check your connection and retry.'
    case 'language-not-supported':
      return "This language isn't supported by the recognition service."
    default:
      return `Voice input error: ${code}`
  }
}

const clean = (raw: string) => raw.replace(/\s+/g, ' ').trim()

export interface SpeechRecognitionApi {
  isSupported: boolean
  isListening: boolean
  interimTranscript: string
  error: string | null
  start: () => void
  /** Stop listening, delivering any final chunk still in flight. */
  stop: () => void
  /** Stop listening and drop anything still in flight — use before a submit. */
  abort: () => void
}

export function useSpeechRecognition({
  onFinalTranscript,
  onError,
  language = 'en-US',
}: {
  onFinalTranscript: (chunk: string) => void
  onError?: (message: string) => void
  language?: string
}): SpeechRecognitionApi {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<Recognition | null>(null)
  /** "The user wants the mic on" — separate from the browser session, which flickers off. */
  const wantsListeningRef = useRef(false)
  const mountedRef = useRef(true)
  const onFinalRef = useRef(onFinalTranscript)
  const onErrorRef = useRef(onError)
  onFinalRef.current = onFinalTranscript
  onErrorRef.current = onError

  useEffect(() => {
    setIsSupported(recognitionConstructor() !== null)
  }, [])

  const report = useCallback((message: string) => {
    setError(message)
    onErrorRef.current?.(message)
  }, [])

  const build = useCallback((): Recognition | null => {
    const Ctor = recognitionConstructor()
    if (!Ctor) return null

    const rec = new Ctor()
    rec.lang = language
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      if (mountedRef.current) setIsListening(true)
    }

    rec.onresult = (event) => {
      if (!mountedRef.current) return
      let interim = ''
      let finalised = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finalised += (finalised ? ' ' : '') + text
        else interim += text
      }
      setInterimTranscript(clean(interim))
      const chunk = clean(finalised)
      if (chunk) onFinalRef.current(chunk)
    }

    rec.onerror = (event) => {
      if (!mountedRef.current) return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantsListeningRef.current = false
      }
      const message = humaniseError(event.error)
      if (message) report(message)
    }

    rec.onend = () => {
      if (!mountedRef.current) return
      setInterimTranscript('')
      if (wantsListeningRef.current) {
        try {
          const fresh = build()
          if (fresh) {
            recognitionRef.current = fresh
            fresh.start()
            return
          }
        } catch (restartError) {
          console.error('[voice] auto-restart failed', restartError)
        }
      }
      wantsListeningRef.current = false
      recognitionRef.current = null
      setIsListening(false)
    }

    return rec
  }, [language, report])

  const start = useCallback(() => {
    if (recognitionRef.current) return
    const rec = build()
    if (!rec) {
      report(UNSUPPORTED)
      return
    }
    setError(null)
    setInterimTranscript('')
    wantsListeningRef.current = true
    recognitionRef.current = rec
    try {
      rec.start()
    } catch (startError) {
      wantsListeningRef.current = false
      recognitionRef.current = null
      setIsListening(false)
      report(startError instanceof Error ? startError.message : 'Could not start voice input. Try again.')
    }
  }, [build, report])

  const stop = useCallback(() => {
    wantsListeningRef.current = false
    setInterimTranscript('')
    const rec = recognitionRef.current
    if (!rec) {
      setIsListening(false)
      return
    }
    try {
      rec.stop()
    } catch {
      try {
        rec.abort()
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null
      setIsListening(false)
    }
  }, [])

  const abort = useCallback(() => {
    wantsListeningRef.current = false
    setInterimTranscript('')
    const rec = recognitionRef.current
    if (!rec) {
      setIsListening(false)
      return
    }
    rec.onresult = null
    try {
      rec.abort()
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null
    setIsListening(false)
  }, [])

  useEffect(() => {
    // Set on mount, not at ref creation: Strict Mode runs this cleanup once in
    // development, and a ref that only ever flips to false would stay false.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      wantsListeningRef.current = false
      const rec = recognitionRef.current
      if (rec) {
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.onstart = null
        try {
          rec.abort()
        } catch {
          /* already stopped */
        }
        recognitionRef.current = null
      }
    }
  }, [])

  return { isSupported, isListening, interimTranscript, error, start, stop, abort }
}
