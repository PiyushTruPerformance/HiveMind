'use client'

import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowUp,
  Database,
  History,
  Info,
  Layers,
  MessageSquarePlus,
  ShieldAlert,
  Sparkles,
  Square,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Avatar, Separator, Tooltip } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/data'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'
import { useAssistant } from '@/lib/state/assistant-provider'
import { useIdentity } from '@/lib/state/identity-provider'
import { cn } from '@/lib/utils/cn'
import { DEMO_NOW_MS } from '@/lib/mock/seed'
import { formatRelative } from '@/lib/utils/format'
import type { AssistantMessage } from '@/platform/types'

import { RichText } from './rich-text'

/**
 * The assistant experience.
 *
 * One component renders in three places — the docked panel, the full-page
 * assistant, and inside an OS — because the only thing that differs between
 * them is width. The scope chip is always visible: a user must be able to see
 * what the assistant can currently read before they trust the answer.
 */
export function AssistantPanel({
  variant = 'dock',
  className,
}: {
  variant?: 'dock' | 'page'
  className?: string
}) {
  const assistant = useAssistant()
  const identity = useIdentity()
  const [draft, setDraft] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const messages = assistant.activeConversation?.messages ?? []

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = async () => {
    const value = draft.trim()
    if (!value || assistant.isStreaming) return
    setDraft('')
    await assistant.send(value)
    inputRef.current?.focus()
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-surface', className)}>
      <AssistantHeader
        variant={variant}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((s) => !s)}
      />

      <ScopeStrip />

      <div className="relative flex min-h-0 flex-1">
        <AnimatePresence>
          {showHistory ? (
            <motion.aside
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
              className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-r bg-surface-sunken/60 p-2"
            >
              <ConversationList onPick={() => setShowHistory(false)} />
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <div ref={scrollRef} className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyThread onPick={(prompt) => void assistant.send(prompt)} />
          ) : (
            <div
              className={cn(
                'space-y-5 px-4 py-5',
                variant === 'page' && 'mx-auto max-w-3xl px-6 py-8',
              )}
            >
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  userName={identity.user.name}
                  avatarUrl={identity.user.avatarUrl}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={cn('border-t bg-surface p-3', variant === 'page' && 'px-6 py-4')}>
        <div className={cn(variant === 'page' && 'mx-auto max-w-3xl')}>
          {messages.length > 0 && !assistant.isStreaming ? (
            <SuggestionRow
              suggestions={assistant.suggestions.slice(0, 2)}
              onPick={(prompt) => void assistant.send(prompt)}
              compact
            />
          ) : null}

          <div className="relative rounded-xl border bg-background shadow-xs transition-colors focus-within:border-border-strong">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              rows={variant === 'page' ? 2 : 1}
              placeholder={placeholderFor(assistant.context.label)}
              aria-label="Message Ask Tru"
              className="scrollbar-thin max-h-40 w-full resize-none bg-transparent px-3.5 py-3 pr-12 text-[13.5px] outline-none placeholder:text-muted-foreground/70"
            />
            <div className="absolute bottom-2 right-2">
              <Button
                size="icon-sm"
                variant={draft.trim() ? 'primary' : 'ghost'}
                onClick={() => void submit()}
                disabled={!draft.trim() || assistant.isStreaming}
                aria-label="Send message"
              >
                {assistant.isStreaming ? <Square className="size-3.5" /> : <ArrowUp />}
              </Button>
            </div>
          </div>

          <p className="mt-2 px-1 text-2xs text-muted-foreground">
            Answers are limited to the products and workspaces you can access.
          </p>
        </div>
      </div>
    </div>
  )
}

function placeholderFor(label: string): string {
  if (label === 'All products') return 'Ask Tru anything about your organization…'
  return `Ask Tru about ${label}…`
}

/* -------------------------------------------------------------------------- */

function AssistantHeader({
  variant,
  showHistory,
  onToggleHistory,
}: {
  variant: 'dock' | 'page'
  showHistory: boolean
  onToggleHistory: () => void
}) {
  const assistant = useAssistant()

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Sparkles className="size-3.5" />
      </span>
      <p className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold">
        {assistant.activeConversation?.title ?? ASK_TRU_NAME}
      </p>
      <Tooltip content="Conversation history">
        <Button
          variant={showHistory ? 'subtle' : 'ghost'}
          size="icon-sm"
          onClick={onToggleHistory}
          aria-label="Conversation history"
          aria-pressed={showHistory}
        >
          <History />
        </Button>
      </Tooltip>
      <Tooltip content="New conversation">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={assistant.startNewConversation}
          aria-label="New conversation"
        >
          <MessageSquarePlus />
        </Button>
      </Tooltip>
      {variant === 'dock' ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => assistant.setOpen(false)}
          aria-label="Close Ask Tru"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
            <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Button>
      ) : null}
    </div>
  )
}

/** Always-visible statement of what the assistant can currently read. */
export function ScopeStrip() {
  const { context } = useAssistant()
  const Icon = context.kind === 'platform' ? Layers : Database

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-surface-sunken/50 px-3 py-2">
      <Badge tone="accent" dot className="max-w-full">
        <Icon className="size-3" aria-hidden />
        <span className="truncate">{context.label}</span>
      </Badge>
      <Tooltip
        content={
          <span>
            Ask Tru reads only these sources, scoped to your permissions:{' '}
            {context.dataSources.join(', ')}.
          </span>
        }
      >
        <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
          <Info className="size-3" aria-hidden />
          {context.dataSources.length} data sources
        </span>
      </Tooltip>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function EmptyThread({ onPick }: { onPick: (prompt: string) => void }) {
  const assistant = useAssistant()

  return (
    <div className="flex h-full flex-col justify-end gap-4 p-4">
      <div className="space-y-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Sparkles className="size-4" />
        </span>
        <div>
          <p className="font-display text-[15px] font-semibold">
            {assistant.context.kind === 'platform'
              ? 'Ask anything about your organization'
              : `Ask about ${assistant.context.label}`}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Ask Tru answers from the data connected to this scope, and only what your role
            allows you to see.
          </p>
        </div>
      </div>

      <SuggestionRow suggestions={assistant.suggestions} onPick={onPick} />

      {assistant.scopedConversations.length > 0 ? (
        <>
          <Separator />
          <div>
            <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent in this scope
            </p>
            <ConversationList limit={3} />
          </div>
        </>
      ) : null}
    </div>
  )
}

function SuggestionRow({
  suggestions,
  onPick,
  compact,
}: {
  suggestions: string[]
  onPick: (prompt: string) => void
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', compact && 'mb-2')}>
      {suggestions.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className={cn(
            'rounded-full border bg-surface px-3 py-1.5 text-left text-2xs leading-snug text-muted-foreground',
            'transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground',
            compact ? 'max-w-full truncate' : 'w-full sm:w-auto',
          )}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}

function ConversationList({ limit, onPick }: { limit?: number; onPick?: () => void }) {
  const assistant = useAssistant()
  const items = useMemo(() => {
    const list = assistant.conversations
    return limit ? list.slice(0, limit) : list
  }, [assistant.conversations, limit])

  if (items.length === 0) {
    return <p className="px-2 py-6 text-center text-2xs text-muted-foreground">No conversations yet.</p>
  }

  return (
    <ul className="space-y-0.5">
      {items.map((conversation) => (
        <li key={conversation.id}>
          <button
            type="button"
            onClick={() => {
              assistant.selectConversation(conversation.id)
              onPick?.()
            }}
            className={cn(
              'w-full rounded-md px-2.5 py-2 text-left transition-colors',
              conversation.id === assistant.activeId ? 'bg-muted' : 'hover:bg-muted/60',
            )}
          >
            <span className="block truncate text-2xs font-medium">{conversation.title}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {conversation.context.label} · {formatRelative(conversation.updatedAt, DEMO_NOW_MS)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */

function MessageBubble({
  message,
  userName,
  avatarUrl,
}: {
  message: AssistantMessage
  userName: string
  avatarUrl?: string
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-muted px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          {message.content}
        </div>
        <Avatar name={userName} src={avatarUrl} size="sm" className="mt-0.5" />
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        {message.error ? (
          <ErrorState title="Assistant error" description={message.error} />
        ) : (
          <>
            {message.content ? (
              <RichText content={message.content} />
            ) : (
              <ThinkingDots />
            )}
            {message.streaming && message.content ? (
              <span className="inline-block h-3.5 w-[2px] animate-caret-blink bg-foreground align-middle" />
            ) : null}

            {message.permissionNotice ? (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft/60 px-2.5 py-2">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <p className="text-2xs leading-relaxed text-foreground/80">{message.permissionNotice}</p>
              </div>
            ) : null}

            {message.citations && message.citations.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {message.citations.map((citation, i) => (
                  <Tooltip key={i} content={citation.detail}>
                    <span className="inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-[10px] text-muted-foreground">
                      <Database className="size-2.5" aria-hidden />
                      {citation.source}
                    </span>
                  </Tooltip>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1" role="status" aria-label="Assistant is thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}
        />
      ))}
    </div>
  )
}
