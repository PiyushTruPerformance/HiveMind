'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Blocks, CornerDownLeft, Search, Settings, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { OSTile } from '@/components/common/os-tile'
import { Avatar, Kbd } from '@/components/ui/misc'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAccess } from '@/lib/access/useAccess'
import { ASK_TRU_NAME } from '@/platform/config/ask-tru'
import { useAssistant } from '@/lib/state/assistant-provider'
import { cn } from '@/lib/utils/cn'
import { OS_LIST, OS_REGISTRY } from '@/platform/config/os-registry'
import { INTEGRATIONS } from '@/platform/config/integrations'

interface Command {
  id: string
  label: string
  group: string
  hint?: string
  icon: ReactNode
  run: () => void
  keywords?: string
}

/**
 * Global command surface (⌘K).
 *
 * It indexes the same three registries the rest of the app is built on — OS
 * products, workspaces, integrations — so a new OS becomes searchable the
 * moment it is registered, with no change here.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const access = useAccess()
  const assistant = useAssistant()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const items: Command[] = []

    items.push({
      id: 'assistant',
      label: `Ask ${ASK_TRU_NAME.replace('Ask ', '')}`,
      group: ASK_TRU_NAME,
      hint: assistant.context.label,
      icon: <Sparkles className="size-4 text-primary" />,
      run: () => assistant.setOpen(true),
      keywords: 'ai chat ask question',
    })

    OS_LIST.forEach((os) => {
      const verdict = access.osAccess(os.id)
      items.push({
        id: `os-${os.id}`,
        label: os.name,
        group: 'Products',
        hint: verdict.allowed ? os.tagline : verdict.message,
        icon: <OSTile os={os} size="sm" locked={!verdict.allowed} />,
        run: () => router.push(`/app/os/${os.id}`),
        keywords: os.shortName,
      })

      if (!verdict.allowed) return
      access.workspacesIn(os.id).forEach((w) => {
        items.push({
          id: `ws-${os.id}-${w.id}`,
          label: w.name,
          group: `${os.shortName} · ${os.workspaceNoun.plural}`,
          hint: w.description,
          icon: <Avatar name={w.name} hue={w.accent} size="sm" square />,
          run: () => router.push(`/app/os/${os.id}/w/${w.id}`),
        })
      })
    })

    INTEGRATIONS.slice(0, 12).forEach((integration) => {
      items.push({
        id: `int-${integration.id}`,
        label: integration.name,
        group: 'Integrations',
        hint: integration.description,
        icon: <Blocks className="size-4 text-muted-foreground" />,
        run: () => router.push(`/app/integrations?focus=${integration.id}`),
      })
    })

    ;[
      ['Organization settings', '/app/settings/organization'],
      ['Plan and billing', '/app/settings/plan'],
      ['Members and access', '/app/settings/members'],
      ['Global administration', '/app/admin'],
    ].forEach(([label, href]) => {
      items.push({
        id: `nav-${href}`,
        label,
        group: 'Settings',
        icon: <Settings className="size-4 text-muted-foreground" />,
        run: () => router.push(href),
      })
    })

    return items
  }, [access, assistant, router])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 9)
    return commands
      .filter((c) => `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(q))
      .slice(0, 12)
  }, [commands, query])

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>()
    results.forEach((c) => {
      const list = map.get(c.group) ?? []
      list.push(c)
      map.set(c.group, list)
    })
    return [...map.entries()]
  }, [results])

  const flat = grouped.flatMap(([, items]) => items)

  const runAt = (index: number) => {
    const command = flat[index]
    if (!command) return
    onOpenChange(false)
    command.run()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        width="lg"
        className="top-[18%] translate-y-0 gap-0 p-0"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, flat.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            runAt(cursor)
          }
        }}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            placeholder="Search products, workspaces, integrations…"
            aria-label="Search the platform"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="scrollbar-thin max-h-[22rem] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                {items.map((command) => {
                  const index = flat.indexOf(command)
                  const active = index === cursor
                  return (
                    <button
                      key={command.id}
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => runAt(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                        active ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      {command.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{command.label}</span>
                        {command.hint ? (
                          <span className="block truncate text-2xs text-muted-foreground">{command.hint}</span>
                        ) : null}
                      </span>
                      {active ? (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <ArrowRight className="size-3.5 shrink-0 text-transparent" aria-hidden />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> to open
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Registers the ⌘K / Ctrl+K shortcut. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { open, setOpen }
}
