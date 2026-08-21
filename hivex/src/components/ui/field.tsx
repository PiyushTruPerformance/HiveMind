'use client'

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

const CONTROL =
  'w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-9', className)} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(CONTROL, 'h-9 appearance-none pr-9', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  },
)

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  optional?: boolean
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode
  className?: string
}) {
  const id = useId()
  const describedBy = hint || error ? `${id}-desc` : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {optional ? <span className="text-2xs font-normal text-muted-foreground">Optional</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy })}
      {error ? (
        <p id={describedBy} className="text-2xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-2xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
