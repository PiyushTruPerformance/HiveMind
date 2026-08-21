'use client'

import { FlaskConical } from 'lucide-react'

/**
 * Marks a module that is *not* backed by the merged ATS service.
 *
 * HR OS now mixes live recruitment data from `services/hr-os` with people-ops
 * screens that remain demo fixtures. Leaving that unmarked would be the worst
 * outcome of the merge: a viewer cannot tell which numbers are real. Every such
 * module carries this banner, and its nav item carries a "Demo" badge.
 */
export function DemoModuleNotice({ module }: { module: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-surface-sunken/60 px-4 py-3">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-[13px] font-medium">{module} is demo data</p>
        <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
          Recruitment in HR OS is live, served by the CV Analyzer service in{' '}
          <code className="font-mono">services/hr-os</code>. People operations are not part of
          that service yet, so this screen shows fixtures.
        </p>
      </div>
    </div>
  )
}
