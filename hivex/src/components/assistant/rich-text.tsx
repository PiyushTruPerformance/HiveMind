import { Fragment, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * A deliberately small markdown subset renderer.
 *
 * Assistant answers need bold, bullets and the occasional comparison table.
 * The live Ask Tru service also answers with headings, numbered steps, links
 * and fenced code, so those are covered too — still without a full markdown
 * pipeline (and the sanitiser it would need). Output is plain React elements:
 * no HTML from the model is ever injected.
 */

function safeHref(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url) ? url : null
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<![*\w])\*[^*\s][^*]*\*(?!\*))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-t${i}`
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? []
      const href = url ? safeHref(url) : null
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          label
        ),
      )
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

interface Block {
  kind: 'p' | 'ul' | 'ol' | 'table' | 'code' | 'h'
  lines: string[]
  level?: number
  language?: string
}

const isBullet = (l: string) => /^\s*[-*]\s+/.test(l)
const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l)
const isTableRow = (l: string) => l.trim().startsWith('|')

function parse(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().length === 0) {
      i += 1
      continue
    }

    const fence = /^\s*```\s*([\w:+-]*)\s*$/.exec(line)
    if (fence) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // closing fence (or end of input)
      blocks.push({ kind: 'code', lines: body, language: fence[1] || undefined })
      continue
    }

    const heading = /^\s*(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'h', lines: [heading[2]], level: heading[1].length })
      i += 1
      continue
    }

    const group: string[] = []
    const kind: Block['kind'] = isTableRow(line) ? 'table' : isBullet(line) ? 'ul' : isNumbered(line) ? 'ol' : 'p'
    const belongs = (l: string) => {
      if (l.trim().length === 0 || /^\s*```/.test(l) || /^\s*#{1,4}\s+/.test(l)) return false
      if (kind === 'table') return isTableRow(l)
      if (kind === 'ul') return isBullet(l)
      if (kind === 'ol') return isNumbered(l)
      return !isTableRow(l) && !isBullet(l) && !isNumbered(l)
    }
    while (i < lines.length && belongs(lines[i])) {
      group.push(lines[i])
      i += 1
    }
    blocks.push({ kind, lines: group })
  }

  return blocks
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
}

export function RichText({ content, className }: { content: string; className?: string }) {
  const blocks = parse(content)

  return (
    <div className={cn('space-y-3 text-[13.5px] leading-relaxed', className)}>
      {blocks.map((block, i) => {
        if (block.kind === 'h') {
          return (
            <p
              key={i}
              className={cn(
                'font-display font-semibold tracking-tight text-foreground',
                block.level === 1 ? 'text-[15px]' : 'text-[14px]',
              )}
            >
              {inline(block.lines[0], `${i}`)}
            </p>
          )
        }

        if (block.kind === 'code') {
          return (
            <pre
              key={i}
              className="scrollbar-thin overflow-x-auto rounded-md border bg-surface-sunken px-3 py-2 font-mono text-[12px] leading-relaxed"
            >
              <code>{block.lines.join('\n')}</code>
            </pre>
          )
        }

        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind === 'ul' ? 'ul' : 'ol'
          return (
            <List
              key={i}
              className={cn('space-y-1.5 pl-4', block.kind === 'ol' && 'pl-5')}
            >
              {block.lines.map((line, j) => (
                <li
                  key={j}
                  className={cn(
                    'marker:text-muted-foreground',
                    block.kind === 'ul' ? 'list-disc' : 'list-decimal',
                  )}
                >
                  {inline(line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''), `${i}-${j}`)}
                </li>
              ))}
            </List>
          )
        }

        if (block.kind === 'table') {
          const rows = block.lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
          const [head, ...body] = rows
          if (!head) return null
          return (
            <div key={i} className="scrollbar-thin overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="bg-surface-sunken">
                  <tr>
                    {cells(head).map((cell, j) => (
                      <th
                        key={j}
                        className={cn(
                          'px-2.5 py-1.5 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground',
                          j > 0 && 'text-right',
                        )}
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, j) => (
                    <tr key={j} className="border-t">
                      {cells(row).map((cell, k) => (
                        <td
                          key={k}
                          className={cn('px-2.5 py-1.5', k > 0 && 'text-right tabular-nums')}
                        >
                          {inline(cell, `${i}-${j}-${k}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(line, `${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
