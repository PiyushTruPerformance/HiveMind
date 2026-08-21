import type { ActivityEvent } from '@/platform/types'
import { hoursAgo, minutesAgo, daysAgo } from '../seed'

/** Cross-OS activity stream shown on the platform home. */
export const DEMO_ACTIVITY: ActivityEvent[] = [
  {
    id: 'act_1',
    kind: 'sync',
    osId: 'reporting',
    workspaceId: 'ws_northwind',
    title: 'GA4, Search Console and Ads sync completed',
    detail: '90 days of data refreshed for Northwind Retail. Period rollups rebuilt.',
    at: minutesAgo(18),
    actor: 'System',
  },
  {
    id: 'act_2',
    kind: 'alert',
    osId: 'reporting',
    workspaceId: 'ws_coastline',
    title: 'Cost per lead up 24% week over week',
    detail: 'Coastline Legal — non-brand search is driving the increase.',
    at: hoursAgo(2),
    actor: 'Anomaly watch',
  },
  {
    id: 'act_3',
    kind: 'assistant',
    title: 'Assistant summarised Q3 across three clients',
    detail: 'Cross-product answer used GA4, Search Console and outreach records.',
    at: hoursAgo(4),
    actor: 'Alex Mercer',
  },
  {
    id: 'act_4',
    kind: 'report',
    osId: 'reporting',
    workspaceId: 'ws_meridian',
    title: 'Weekly report delivered',
    detail: 'Meridian Health — sent to 5 recipients.',
    at: hoursAgo(9),
    actor: 'Scheduler',
  },
  {
    id: 'act_5',
    kind: 'workspace',
    osId: 'seo',
    workspaceId: 'ws_seo_lumen',
    title: '12 prospect sites moved to Approved',
    detail: 'Lumen Studio — editorial placements campaign.',
    at: hoursAgo(21),
    actor: 'Nadia Okonkwo',
  },
  {
    id: 'act_6',
    kind: 'member',
    title: 'Theo Lindqvist requested to join',
    detail: 'Matched on the truperformance.us domain. Awaiting approval.',
    at: daysAgo(2),
    actor: 'Clerk',
  },
  {
    id: 'act_7',
    kind: 'integration',
    title: 'Slack reconnection required',
    detail: 'The workspace token was revoked. Reconnect to restore channel posting.',
    at: daysAgo(3),
    actor: 'System',
  },
  {
    id: 'act_8',
    kind: 'workspace',
    osId: 'hr',
    workspaceId: 'ws_hr_growth',
    title: '18 CVs screened for Senior Performance Analyst',
    detail: '6 shortlisted, 9 to review, 3 rejected.',
    at: daysAgo(4),
    actor: 'Hana Sato',
  },
]

export const ACTIVITY_BY_OS = (osId: string) => DEMO_ACTIVITY.filter((a) => a.osId === osId)
