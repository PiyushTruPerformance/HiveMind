'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'

import { useAllApplications } from '../api/hooks'
import { CandidateDrawer } from './candidate-drawer'
import { HrStatusBadge } from './status'

/**
 * Search every candidate the service holds, across all roles.
 *
 * The detail drawer is opened only after this dialog closes rather than
 * stacking two Radix dialogs — keeps focus trapping and z-index predictable.
 * (Behaviour carried over from the original.)
 */
export function CandidateSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const query = useAllApplications(open)
  const [term, setTerm] = useState('')
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)

  const results = useMemo(() => {
    const all = query.data ?? []
    const q = term.trim().toLowerCase()
    if (!q) return all.slice(0, 40)
    return all
      .filter(({ candidate, job_title }) =>
        [candidate.name, candidate.email, candidate.phone, job_title].some((field) =>
          field?.toLowerCase().includes(q),
        ),
      )
      .slice(0, 40)
  }, [query.data, term])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent width="lg">
          <DialogHeader>
            <DialogTitle>Search candidates</DialogTitle>
            <DialogDescription>
              Across every role in HR OS, not just this client.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Name, email, phone or role…"
              aria-label="Search candidates"
              className="pl-9"
            />
          </div>

          <div className="scrollbar-thin max-h-80 space-y-1.5 overflow-y-auto">
            {query.isLoading ? (
              <p className="py-8 text-center text-2xs text-muted-foreground">Loading…</p>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-2xs text-muted-foreground">
                {term ? `Nothing matches “${term}”.` : 'No candidates yet.'}
              </p>
            ) : (
              results.map((application) => (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => {
                    onOpenChange(false)
                    setOpenApplicationId(application.id)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">
                      {application.candidate.name ?? 'Unknown'}
                    </span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {application.candidate.email ?? '—'} · {application.job_title}
                    </span>
                  </span>
                  <HrStatusBadge status={application.application_status} />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CandidateDrawer
        applicationId={openApplicationId}
        onOpenChange={(drawerOpen) => !drawerOpen && setOpenApplicationId(null)}
      />
    </>
  )
}
