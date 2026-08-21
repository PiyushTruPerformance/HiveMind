/** CSV export helpers, ported from the CV Analyzer's `lib/csv.ts`. */

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => escapeCsvCell(cell === null || cell === undefined ? '' : String(cell)))
        .join(','),
    )
    .join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
