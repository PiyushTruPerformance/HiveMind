'use client'

import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils/cn'

/**
 * Editable list of short strings — the control the job wizard uses for every
 * AI-extracted requirement field (skills, responsibilities, certifications…).
 *
 * Ported from the CV Analyzer. Behaviour kept: Enter or comma commits, and
 * Backspace on an empty input removes the last tag, so a mistyped entry can be
 * undone without reaching for the mouse.
 */
export function TagListInput({
  label,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const value = raw.trim().replace(/,$/, '').trim()
    if (!value) return
    if (values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, value])
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium">{label}</label>

      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value}>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border bg-surface py-0.5 pl-2.5 pr-1 text-2xs',
                  disabled && 'opacity-60',
                )}
              >
                {value}
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => onChange(values.filter((v) => v !== value))}
                    aria-label={`Remove ${value}`}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Input
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
    </div>
  )
}
