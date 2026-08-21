'use client'

import { ArrowUp, Database, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'
import { useAssistant } from '@/lib/state/assistant-provider'
import { cn } from '@/lib/utils/cn'

/**
 * The assistant's front door.
 *
 * A full-width command bar with the current scope stated on it. It appears at
 * the top of the platform home and at the top of every OS overview, so the
 * assistant is the first thing on the page rather than a bubble in a corner.
 * Submitting opens the dock with the answer already streaming.
 */
export function AssistantLauncher({
  title,
  className,
  compact,
}: {
  title?: string
  className?: string
  compact?: boolean
}) {
  const assistant = useAssistant()
  const [draft, setDraft] = useState('')

  const ask = (prompt: string) => {
    const value = prompt.trim()
    if (!value) return
    setDraft('')
    assistant.setOpen(true)
    assistant.startNewConversation()
    void assistant.send(value)
  }

  const placeholder =
    assistant.context.kind === 'platform'
      ? 'Ask Tru anything about your organization…'
      : `Ask Tru about ${assistant.context.label}…`

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card shadow-sm',
        compact ? 'p-4' : 'p-5',
        className,
      )}
    >
      <div className="ambient" aria-hidden />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Sparkles className="size-4" />
          </span>
          <h2 className="font-display text-[15px] font-semibold">{title ?? ASK_TRU_NAME}</h2>
          <Badge tone="accent" dot className="ml-auto max-w-[14rem]">
            <span className="truncate">{assistant.context.label}</span>
          </Badge>
        </div>

        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft)
          }}
        >
          <div className="relative rounded-xl border bg-background shadow-xs transition-colors focus-within:border-border-strong">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="h-12 w-full rounded-xl bg-transparent px-4 pr-12 text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <Button
              type="submit"
              size="icon-sm"
              variant={draft.trim() ? 'primary' : 'ghost'}
              disabled={!draft.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Ask Tru"
            >
              <ArrowUp />
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {assistant.suggestions.slice(0, compact ? 2 : 3).map((prompt, i) => (
            <motion.button
              key={prompt}
              type="button"
              onClick={() => ask(prompt)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.18 }}
              className="rounded-full border bg-surface px-3 py-1.5 text-2xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground"
            >
              {prompt}
            </motion.button>
          ))}
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Database className="size-3" aria-hidden />
          Reading {assistant.context.dataSources.join(', ')} — limited to your access.
        </p>
      </div>
    </section>
  )
}
