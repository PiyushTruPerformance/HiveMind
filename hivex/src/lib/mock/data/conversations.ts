import type { Conversation } from '@/platform/types'
import { daysAgo, hoursAgo } from '../seed'

/** Conversation history seeded so the assistant never opens empty on a demo. */
export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_seed_1',
    title: 'Q3 performance across all clients',
    context: {
      kind: 'platform',
      label: 'All products',
      dataSources: ['GA4', 'Search Console', 'Google Ads', 'Outreach records'],
    },
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(4),
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Show me the most important things happening across my organization.',
        createdAt: hoursAgo(4),
      },
      {
        id: 'm2',
        role: 'assistant',
        createdAt: hoursAgo(4),
        content:
          'Three things stand out this week.\n\n**Coastline Legal needs attention.** Cost per lead is up 24% week over week and conversions are down 14%. Non-brand search is the driver — spend held flat while conversion rate fell.\n\n**Lumen Studio is compounding.** Sessions are up 21% and organic clicks 19% over the last 30 days, tracking the editorial placements that went live in July.\n\n**Northwind Retail is stable and healthy.** Sessions up 8%, conversions up 13%, spend down 3% — efficiency improving without volume loss.',
        citations: [
          { source: 'GA4', detail: '4 properties · last 30 days' },
          { source: 'Google Ads', detail: '3 accounts · last 30 days' },
          { source: 'Search Console', detail: '4 properties · last 30 days' },
        ],
      },
    ],
  },
  {
    id: 'conv_seed_2',
    title: 'Northwind organic traffic',
    context: {
      kind: 'workspace',
      osId: 'reporting',
      workspaceId: 'ws_northwind',
      label: 'Reporting OS · Northwind Retail',
      dataSources: ['GA4', 'Search Console', 'Google Ads', 'Business Profile'],
    },
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'What was our organic traffic last month?',
        createdAt: daysAgo(1),
      },
      {
        id: 'm2',
        role: 'assistant',
        createdAt: daysAgo(1),
        content:
          'Organic search delivered **148,300 sessions** to Northwind Retail last month, 31% of total traffic and up 11.4% on the prior month. Search Console attributes 62,900 clicks to the same window at an average position of 8.6.\n\nThe gain is concentrated in category pages rather than brand terms, which is what the Q3 authority campaign was aiming at.',
        citations: [
          { source: 'GA4', detail: 'property 318294771 · sessions by default channel group' },
          { source: 'Search Console', detail: 'sc-domain:northwind.com · clicks, position' },
        ],
      },
    ],
  },
]

/** Prompts offered when the assistant opens with no conversation selected. */
export const PLATFORM_SUGGESTIONS = [
  'Show me the most important things happening across my organization.',
  'Which clients are trending down this month, and why?',
  'Summarise what my team shipped this week.',
  'Where is our budget being spent least efficiently?',
]
