import { Fragment, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * A deliberately small markdown subset renderer.
 *
 * Assistant answers need bold, bullets and the occasional comparison table —
 * nothing more. Pulling in a full markdown pipeline (plus a sanitiser) for that
 * would be weight the frontend foundation does not need to carry yet. When the
 * real model backend lands and answers get richer, this is the one file that
 * gets replaced.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = match.index + token.length
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

interface Block {
  kind: 'p' | 'ul' | 'table'
  lines: string[]
}

function parse(source: string): Block[] {
  const blocks: Block[] = []
  const paragraphs = source.split(/\n{2,}/)

  paragraphs.forEach((chunk) => {
    const lines = chunk.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length === 0) return
    if (lines.every((l) => l.trim().startsWith('|'))) blocks.push({ kind: 'table', lines })
    else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) blocks.push({ kind: 'ul', lines })
    else blocks.push({ kind: 'p', lines })
  })

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
        if (block.kind === 'ul') {
          return (
            <ul key={i} className="space-y-1.5 pl-4">
              {block.lines.map((line, j) => (
                <li key={j} className="list-disc marker:text-muted-foreground">
                  {inline(line.replace(/^\s*[-*]\s+/, ''), `${i}-${j}`)}
                </li>
              ))}
            </ul>
          )
        }

        if (block.kind === 'table') {
          const rows = block.lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
          const [head, ...body] = rows
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
