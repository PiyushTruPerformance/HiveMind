import { daysAgo, makeRng, seedFrom } from '../seed'

/**
 * HR OS people-operations fixtures.
 *
 * Recruitment (jobs, candidates, applications, screening) is NOT here — it is
 * served for real by services/hr-os, the CV Analyzer merged into this repo. Only
 * the people-ops modules that service does not cover remain as fixtures, and
 * every screen using them renders <DemoModuleNotice> so the distinction between
 * live and demo data is visible in the product.
 */

export interface Employee {
  id: string
  name: string
  role: string
  department: string
  location: string
  startedAt: string
  status: 'active' | 'onboarding' | 'on leave'
  manager: string
}

const EMPLOYEE_DEFS: Omit<Employee, 'id' | 'startedAt'>[] = [
  { name: 'Priya Raghunathan', role: 'VP, Performance', department: 'Leadership', location: 'Seattle, WA', status: 'active', manager: 'Alex Mercer' },
  { name: 'Dmitri Volkov', role: 'Analytics Lead', department: 'Analytics', location: 'Remote — EU', status: 'active', manager: 'Priya Raghunathan' },
  { name: 'Nadia Okonkwo', role: 'SEO Strategist', department: 'Growth', location: 'Remote — US', status: 'active', manager: 'Priya Raghunathan' },
  { name: 'Marco Bianchi', role: 'Reporting Analyst', department: 'Analytics', location: 'Seattle, WA', status: 'on leave', manager: 'Dmitri Volkov' },
  { name: 'Hana Sato', role: 'Talent Lead', department: 'People', location: 'Portland, OR', status: 'active', manager: 'Alex Mercer' },
  { name: 'Oscar Reyes', role: 'Paid Media Specialist', department: 'Growth', location: 'Remote — US', status: 'onboarding', manager: 'Priya Raghunathan' },
]

export function employees(workspaceId: string): Employee[] {
  const rng = makeRng(seedFrom(`${workspaceId}:employees`))
  return EMPLOYEE_DEFS.map((def, i) => ({
    ...def,
    id: `emp_${workspaceId}_${i}`,
    startedAt: daysAgo(Math.round(30 + rng() * 900)),
  }))
}

export interface AttendanceRow {
  name: string
  status: 'In office' | 'Remote' | 'PTO' | 'Sick'
  hours: number
  checkedInAt?: string
}

export function attendance(workspaceId: string): AttendanceRow[] {
  const rng = makeRng(seedFrom(`${workspaceId}:attendance`))
  const options: AttendanceRow['status'][] = ['In office', 'Remote', 'Remote', 'PTO', 'Sick']
  return EMPLOYEE_DEFS.map((def) => {
    const status = options[Math.floor(rng() * options.length)]
    return {
      name: def.name,
      status,
      hours: status === 'PTO' || status === 'Sick' ? 0 : Number((6 + rng() * 3).toFixed(1)),
      checkedInAt: status === 'PTO' || status === 'Sick' ? undefined : `0${8 + Math.floor(rng() * 2)}:${rng() > 0.5 ? '15' : '45'}`,
    }
  })
}

export interface PayrollRow {
  cycle: string
  headcount: number
  gross: number
  employerCost: number
  status: 'draft' | 'approved' | 'paid'
  runsOn: string
}

export function payroll(workspaceId: string): PayrollRow[] {
  const rng = makeRng(seedFrom(`${workspaceId}:payroll`))
  const cycles = ['August 2026', 'July 2026', 'June 2026', 'May 2026']
  const statuses: PayrollRow['status'][] = ['draft', 'paid', 'paid', 'paid']
  return cycles.map((cycle, i) => {
    const headcount = 24 + Math.round(rng() * 6)
    const gross = Math.round(headcount * (7_400 + rng() * 1_800))
    return {
      cycle,
      headcount,
      gross,
      employerCost: Math.round(gross * 1.19),
      status: statuses[i],
      runsOn: daysAgo(i * 30),
    }
  })
}
