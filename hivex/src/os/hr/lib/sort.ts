import type { Application } from '../api/types'

/** Sorting for candidate lists. Ported from the CV Analyzer's `lib/sort.ts`. */

export type SortOption = 'recent' | 'ai_score' | 'ats_score'

export const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Newest first',
  ai_score: 'Highest AI score',
  ats_score: 'Highest ATS score',
}

export function sortApplications<T extends Pick<Application, 'ai_score' | 'ats_score'>>(
  applications: T[],
  sortBy: SortOption,
): T[] {
  if (sortBy === 'recent') return applications
  return [...applications].sort((a, b) => {
    const aValue = a[sortBy]
    const bValue = b[sortBy]
    if (aValue === null && bValue === null) return 0
    // Unscored candidates sink to the bottom rather than topping a score sort.
    if (aValue === null) return 1
    if (bValue === null) return -1
    return bValue - aValue
  })
}
