import {
  Activity,
  BadgeCheck,
  BarChart3,
  Banknote,
  Blocks,
  Bot,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Coins,
  FileBarChart,
  FileSpreadsheet,
  Gauge,
  Globe,
  Kanban,
  KeyRound,
  LayoutDashboard,
  Link2,
  Mails,
  Megaphone,
  Presentation,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  UserSearch,
  Wallet,
} from 'lucide-react'

import type { OSId, OSProduct } from '@/platform/types'

/**
 * OS product registry — the centre of the multi-product architecture.
 *
 * Adding a product to the platform means adding one entry here and one folder
 * under src/os/<id>/. Nothing in the shell, the launcher, the router, the
 * access layer or the assistant hardcodes an OS id; they all iterate this map.
 *
 * Which plans unlock which OS is NOT stored here — it is derived from
 * src/platform/config/plans.ts so the two cannot drift apart.
 */
export const OS_REGISTRY: Record<OSId, OSProduct> = {
  /* ------------------------------------------------------------------ */
  /* Reporting OS — the primary architectural reference                  */
  /* ------------------------------------------------------------------ */
  reporting: {
    id: 'reporting',
    name: 'Reporting OS',
    shortName: 'Reporting',
    description:
      'Marketing intelligence, client workspaces and reporting automation across GA4, Search Console, Google Ads and Business Profile.',
    tagline: 'Every client metric, one command centre.',
    icon: BarChart3,
    hue: '212 84% 54%',
    status: 'live',
    requiredIntegrations: ['ga4'],
    optionalIntegrations: ['gsc', 'google-ads', 'gbp', 'slack', 'outlook', 'zoom', 'notion'],
    supportsWorkspaces: true,
    workspaceNoun: { singular: 'Client', plural: 'Clients' },
    navigation: [
      { id: '', label: 'Command centre', icon: LayoutDashboard, group: 'Overview' },
      {
        id: 'dashboard',
        label: 'Analytics',
        icon: Activity,
        group: 'Performance',
        description: 'GA4 sessions, users, conversions and channel mix.',
      },
      {
        id: 'search',
        label: 'Search',
        icon: Search,
        group: 'Performance',
        description: 'Search Console clicks, impressions, CTR and position.',
      },
      {
        id: 'ads',
        label: 'Paid media',
        icon: Megaphone,
        group: 'Performance',
        description: 'Google Ads spend, conversions, ROAS and CPC.',
      },
      {
        id: 'reports',
        label: 'Period reports',
        icon: FileBarChart,
        group: 'Delivery',
        description: 'Daily through yearly rollups, ready to send.',
      },
      {
        id: 'decks',
        label: 'Decks',
        icon: Presentation,
        group: 'Delivery',
        description: 'Generated QBR and monthly presentation decks.',
      },
      {
        id: 'audits',
        label: 'Audits',
        icon: ClipboardCheck,
        group: 'Delivery',
        minRole: 'analyst',
      },
      { id: 'kanban', label: 'Sprint board', icon: Kanban, group: 'Work' },
      {
        id: 'settings',
        label: 'Workspace settings',
        icon: Settings,
        group: 'Manage',
        minRole: 'team_lead',
      },
    ],
    sections: [
      { id: '', label: 'Overview', icon: Gauge },
      { id: 'workspaces', label: 'Clients', icon: Briefcase },
      { id: 'assistant', label: 'Ask Tru', icon: Sparkles },
      { id: 'integrations', label: 'Integrations', icon: Blocks },
    ],
    marketing: {
      headline: 'Turn marketing data into reports your clients actually read.',
      subheadline:
        'Reporting OS pulls GA4, Search Console, Google Ads and Business Profile into one client workspace, keeps the rollups current, and turns them into scheduled reports and decks.',
      problems: [
        'Monthly reporting eats days of analyst time that should go into the work itself.',
        'Every client asks the same questions in a slightly different format.',
        'Numbers in the deck stop matching the dashboard the moment anything is re-synced.',
        'Nobody notices a client is sliding until the quarterly review.',
      ],
      audience: [
        'Marketing agencies reporting to a portfolio of clients',
        'In-house performance teams with several brands or regions',
        'Anyone reconciling GA4, Search Console and Google Ads by hand',
      ],
      capabilities: [
        {
          title: 'Every Google source, synced',
          description:
            'GA4, Search Console, Google Ads and Business Profile on one authorization, synced daily into period rollups that update in place until the period closes.',
          icon: Activity,
        },
        {
          title: 'Period reports that build themselves',
          description:
            'Daily through yearly rollups per client, generated on schedule and delivered to the recipients you name.',
          icon: FileBarChart,
        },
        {
          title: 'Decks without the copy-paste',
          description:
            'QBR and monthly presentations generated from live data, exportable to PPTX and PDF.',
          icon: Presentation,
        },
        {
          title: 'Client audits',
          description:
            'Site, conversion-path and tracking-integrity audits with findings ranked by severity.',
          icon: ClipboardCheck,
        },
        {
          title: 'Sprint board per client',
          description:
            'The work behind the numbers, tracked next to them instead of in a separate tool.',
          icon: Kanban,
        },
        {
          title: 'Ask Tru on your own data',
          description:
            'Ask what changed and why, scoped to the client you are looking at and the sources you have connected.',
          icon: Sparkles,
        },
      ],
      workflows: [
        {
          title: 'Onboard a client',
          steps: [
            'Create the client workspace',
            'Map its GA4 property, Search Console site and Ads account',
            'Run the first 90-day sync',
            'Share the dashboard',
          ],
        },
        {
          title: 'Close the month',
          steps: [
            'Rollups rebuild automatically',
            'Review the generated period report',
            'Generate the deck',
            'Send to the recipient list',
          ],
        },
        {
          title: 'Catch a problem early',
          steps: [
            'Anomaly watch flags a spike in cost per lead',
            'Open the client command centre',
            'Ask Tru what drove it',
            'Raise a sprint task against the fix',
          ],
        },
      ],
      outcomes: [
        { label: 'Reporting time', value: '-80%', caption: 'versus building decks by hand' },
        { label: 'Sources unified', value: '4', caption: 'GA4, GSC, Ads, Business Profile' },
        { label: 'Rollup periods', value: '5', caption: 'daily through yearly' },
      ],
    },
    assistant: {
      placeholder: 'Ask Reporting OS about traffic, spend or a client…',
      suggestions: [
        'What was organic traffic last month versus the month before?',
        'Which channel drove the most conversions this quarter?',
        'Summarise Google Ads spend and ROAS for the last 30 days.',
        'Which clients had a drop in Search Console clicks this week?',
      ],
      dataSources: ['GA4', 'Search Console', 'Google Ads', 'Business Profile'],
    },
  },

  /* ------------------------------------------------------------------ */
  /* SEO OS — modelled on the AI Backlink Generator                      */
  /* ------------------------------------------------------------------ */
  seo: {
    id: 'seo',
    name: 'SEO OS',
    shortName: 'SEO',
    description:
      'Link acquisition, keyword tracking, technical audits and outreach automation for every SEO project you run.',
    tagline: 'Prospect, pitch and prove every link.',
    icon: Globe,
    hue: '162 62% 38%',
    status: 'live',
    requiredIntegrations: ['gsc'],
    optionalIntegrations: ['semrush', 'ga4', 'wappalyzer', 'looker', 'gmail', 'brevo'],
    supportsWorkspaces: true,
    workspaceNoun: { singular: 'Project', plural: 'Projects' },
    navigation: [
      { id: '', label: 'Overview', icon: LayoutDashboard, group: 'Overview' },
      { id: 'campaigns', label: 'Campaigns', icon: Target, group: 'Link building' },
      { id: 'prospects', label: 'Prospect sites', icon: Link2, group: 'Link building' },
      { id: 'outreach', label: 'Outreach', icon: Mails, group: 'Link building' },
      { id: 'keywords', label: 'Keywords', icon: KeyRound, group: 'Visibility' },
      { id: 'rankings', label: 'Rankings', icon: TrendingUp, group: 'Visibility' },
      { id: 'audits', label: 'Site audits', icon: ClipboardCheck, group: 'Visibility' },
      {
        id: 'settings',
        label: 'Project settings',
        icon: Settings,
        group: 'Manage',
        minRole: 'team_lead',
      },
    ],
    sections: [
      { id: '', label: 'Overview', icon: Gauge },
      { id: 'workspaces', label: 'Projects', icon: Globe },
      { id: 'assistant', label: 'Ask Tru', icon: Sparkles },
      { id: 'integrations', label: 'Integrations', icon: Blocks },
    ],
    marketing: {
      headline: 'Prospect, pitch and prove every link.',
      subheadline:
        'SEO OS runs the whole link-acquisition pipeline — discover prospects, score them against the client niche with AI, find the contact, run outreach and follow-ups, and verify the link went live.',
      problems: [
        'Prospecting is manual, and half the sites turn out to be irrelevant.',
        'Outreach dies in follow-up because nobody is chasing on schedule.',
        'Nobody can prove which links are still live three months later.',
        'Keyword tracking lives in one tool and the link work in another.',
      ],
      audience: [
        'SEO agencies running link campaigns for multiple clients',
        'In-house SEO leads owning both content and authority',
        'Anyone tracking outreach in a spreadsheet',
      ],
      capabilities: [
        {
          title: 'AI relevance scoring',
          description:
            'Every prospect is scraped, classified and scored 0-100 against the client niche, with the reasoning attached to the score.',
          icon: Target,
        },
        {
          title: 'Visible pipeline',
          description:
            'Queued, scraping, scoring, ready or failed — per site. A failed scrape is shown as failed, not silently dropped.',
          icon: Link2,
        },
        {
          title: 'Outreach and follow-ups',
          description:
            'Templated, personalised emails with rules-based follow-ups that fire on their own schedule.',
          icon: Mails,
        },
        {
          title: 'Keyword and ranking tracking',
          description:
            'Position, volume and difficulty across the tracked set, joined to the pages you are building authority for.',
          icon: KeyRound,
        },
        {
          title: 'Technical audits',
          description:
            'Crawlability, performance, content and markup findings, ranked by severity and pages affected.',
          icon: ClipboardCheck,
        },
        {
          title: 'Ask Tru on the pipeline',
          description:
            'Ask which prospects are worth chasing, what replied, and which keywords moved.',
          icon: Sparkles,
        },
      ],
      workflows: [
        {
          title: 'Run a link campaign',
          steps: [
            'Create the project and campaign',
            'Import prospect URLs or a CSV',
            'Let the AI pipeline score and find contacts',
            'Approve the good ones and send outreach',
          ],
        },
        {
          title: 'Chase without chasing',
          steps: [
            'Set a follow-up rule per campaign',
            'Follow-ups send on schedule',
            'Replies land in the outreach tab',
            'Verify the link went live',
          ],
        },
      ],
      outcomes: [
        { label: 'Reply rate', value: '2x', caption: 'templated versus generic outreach' },
        { label: 'Prospects scored', value: 'Auto', caption: 'scrape, classify, score, find contact' },
        { label: 'Link verification', value: '1 click', caption: 'checks the page for your domain' },
      ],
    },
    assistant: {
      placeholder: 'Ask SEO OS about links, keywords or a campaign…',
      suggestions: [
        'Which prospect sites scored above 80 relevance this week?',
        'How many outreach emails were replied to in the last 30 days?',
        'Which keywords moved into the top 3 this month?',
        'Summarise the technical issues found in the latest audit.',
      ],
      dataSources: ['Search Console', 'SEMrush', 'Crawler', 'Outreach records'],
    },
  },

  /* ------------------------------------------------------------------ */
  /* HR OS — modelled on the CV Analyzer ATS                             */
  /* ------------------------------------------------------------------ */
  hr: {
    id: 'hr',
    name: 'HR OS',
    shortName: 'HR',
    description:
      'Applicant tracking with AI screening, plus the people operations that follow the hire — records, attendance and payroll.',
    tagline: 'From first CV to first payslip.',
    icon: Users,
    hue: '272 58% 60%',
    status: 'live',
    requiredIntegrations: [],
    optionalIntegrations: ['gmail', 'google-calendar', 'slack', 'notion', 'monday'],
    supportsWorkspaces: true,
    /**
     * A workspace in HR OS is a hiring client, matching the `clients` table in
     * services/hr-os. Same mapping Reporting OS uses for its own clients.
     */
    workspaceNoun: { singular: 'Client', plural: 'Clients' },
    navigation: [
      { id: '', label: 'Overview', icon: LayoutDashboard, group: 'Overview' },
      {
        id: 'jobs',
        label: 'Jobs',
        icon: Briefcase,
        group: 'Recruitment',
        description: 'Roles for this client, with AI-extracted requirements.',
      },
      {
        id: 'candidates',
        label: 'Candidates',
        icon: UserSearch,
        group: 'Recruitment',
        description: 'Applications, ATS and AI scores, and screening decisions.',
      },
      {
        id: 'pipeline',
        label: 'Screening pipeline',
        icon: Kanban,
        group: 'Recruitment',
        description: 'Every application by stage, across this client’s roles.',
      },
      /* People operations are not part of the merged ATS service — flagged so
         the distinction between live and demo data is visible in navigation. */
      { id: 'employees', label: 'Employees', icon: Users, group: 'People', badge: 'Demo' },
      { id: 'attendance', label: 'Attendance', icon: CalendarClock, group: 'People', badge: 'Demo' },
      {
        id: 'payroll',
        label: 'Payroll',
        icon: Wallet,
        group: 'People',
        minRole: 'team_lead',
        badge: 'Demo',
      },
      {
        id: 'settings',
        label: 'Client settings',
        icon: Settings,
        group: 'Manage',
        minRole: 'team_lead',
      },
    ],
    sections: [
      { id: '', label: 'Overview', icon: Gauge },
      { id: 'workspaces', label: 'Clients', icon: Users },
      { id: 'assistant', label: 'Ask Tru', icon: Sparkles },
      { id: 'integrations', label: 'Integrations', icon: Blocks },
    ],
    marketing: {
      headline: 'From first CV to first payslip.',
      subheadline:
        'HR OS reads every CV — scanned ones included — scores it against what the role actually needs, and sorts candidates into Shortlisted, Review and Rejected with an explanation for every decision.',
      problems: [
        'Screening a hundred CVs by hand is the slowest part of every hire.',
        'Keyword filters reject good candidates and pass bad ones.',
        'Nobody can say why a candidate was rejected six weeks later.',
        'A CV that fails to parse just disappears from the results.',
      ],
      audience: [
        'Recruiters hiring across several client companies',
        'In-house talent teams with steady inbound volume',
        'Anyone screening CVs in a shared inbox',
      ],
      capabilities: [
        {
          title: 'AI job-description extraction',
          description:
            'Paste or upload the JD and the required skills, experience, education and keywords are extracted — then reviewed by you before the role goes live.',
          icon: Briefcase,
        },
        {
          title: 'OCR on anything',
          description:
            'PDFs, DOCX, images and scanned CVs are all read, so a photographed CV screens like any other.',
          icon: UserSearch,
        },
        {
          title: 'Two scores, one decision',
          description:
            'A deterministic ATS keyword score pre-filters; the AI score decides the outcome — and shows the evidence it found and what was missing.',
          icon: BadgeCheck,
        },
        {
          title: 'Failures stay visible',
          description:
            'Each pipeline stage carries its own status, so a candidate whose OCR failed shows as FAILED with a retry, instead of vanishing.',
          icon: ClipboardCheck,
        },
        {
          title: 'Candidate communication',
          description:
            'Status changes email the candidate, with per-application delivery state and a resend when it bounces.',
          icon: Mails,
        },
        {
          title: 'Ask Tru on the pipeline',
          description:
            'Ask which roles are stalling, who is shortlisted, and why the top candidates scored well.',
          icon: Sparkles,
        },
      ],
      workflows: [
        {
          title: 'Open a role',
          steps: [
            'Create the job and paste the description',
            'Review the AI-extracted requirements',
            'Approve and set it OPEN',
            'Upload CVs',
          ],
        },
        {
          title: 'Screen a batch',
          steps: [
            'Upload CVs in bulk',
            'OCR, parsing, ATS screening and AI matching run per file',
            'Review scores and reasoning',
            'Shortlist or reject in bulk — candidates are emailed',
          ],
        },
      ],
      outcomes: [
        { label: 'Time to screen', value: '1.4d', caption: 'upload to decision' },
        { label: 'Explained decisions', value: '100%', caption: 'every score carries its reasoning' },
        { label: 'Formats read', value: 'All', caption: 'PDF, DOCX, images, scans' },
      ],
    },
    assistant: {
      placeholder: 'Ask HR OS about a role, a candidate or the pipeline…',
      suggestions: [
        'How many candidates are shortlisted for the open engineering roles?',
        'Which jobs have had no new applications in two weeks?',
        'Summarise why the top three candidates for Senior Analyst scored well.',
        'What is the average time from upload to screening decision?',
      ],
      dataSources: ['Applications', 'Job requirements', 'ATS and AI scores'],
    },
  },

  /* ------------------------------------------------------------------ */
  /* Finance OS — not yet released; proves the "coming soon" path        */
  /* ------------------------------------------------------------------ */
  finance: {
    id: 'finance',
    name: 'Finance OS',
    shortName: 'Finance',
    description:
      'Retainers, invoicing, spend tracking and profitability per client — reconciled against the work delivered elsewhere on the platform.',
    tagline: 'Know what every engagement actually earns.',
    icon: Coins,
    hue: '340 62% 56%',
    status: 'coming_soon',
    requiredIntegrations: [],
    optionalIntegrations: ['hubspot', 'google-drive'],
    supportsWorkspaces: true,
    workspaceNoun: { singular: 'Entity', plural: 'Entities' },
    navigation: [
      { id: '', label: 'Overview', icon: LayoutDashboard, group: 'Overview' },
      { id: 'invoices', label: 'Invoices', icon: Receipt, group: 'Revenue' },
      { id: 'retainers', label: 'Retainers', icon: BadgeCheck, group: 'Revenue' },
      { id: 'expenses', label: 'Expenses', icon: Banknote, group: 'Spend' },
      { id: 'budgets', label: 'Budgets', icon: FileSpreadsheet, group: 'Spend' },
      { id: 'settings', label: 'Settings', icon: Settings, group: 'Manage', minRole: 'team_lead' },
    ],
    sections: [
      { id: '', label: 'Overview', icon: Gauge },
      { id: 'workspaces', label: 'Entities', icon: Coins },
      { id: 'assistant', label: 'Ask Tru', icon: Sparkles },
      { id: 'integrations', label: 'Integrations', icon: Blocks },
    ],
    marketing: {
      headline: 'Know what every engagement actually earns.',
      subheadline:
        'Finance OS will reconcile retainers, invoices and spend against the work delivered in your other products, so margin per client stops being a spreadsheet exercise.',
      problems: [
        'Profitability per client is reconstructed by hand, quarterly, badly.',
        'Retainer overruns surface after the money is spent.',
        'Delivery data and finance data never meet.',
      ],
      audience: [
        'Agency owners and finance leads',
        'Operations teams tracking retainer burn',
      ],
      capabilities: [
        {
          title: 'Invoices and retainers',
          description: 'Track what was agreed, what was billed and what is outstanding per client.',
          icon: Receipt,
        },
        {
          title: 'Spend and budgets',
          description: 'Costs against budget, per engagement, with alerts before an overrun.',
          icon: Banknote,
        },
        {
          title: 'Margin per engagement',
          description:
            'Delivery effort from your other products, reconciled against revenue.',
          icon: Coins,
        },
      ],
      workflows: [
        {
          title: 'Close the month',
          steps: ['Reconcile invoices', 'Review retainer burn', 'Publish margin by client'],
        },
      ],
      outcomes: [
        { label: 'Status', value: 'In design', caption: 'not yet released' },
      ],
    },
    assistant: {
      placeholder: 'Ask Finance OS about revenue, spend or margin…',
      suggestions: [
        'Which clients are over their retainer this month?',
        'What is our gross margin per engagement?',
      ],
      dataSources: ['Invoices', 'Retainers', 'Expenses'],
    },
  },
}

/** Display order in the launcher and the OS rail. */
export const OS_ORDER: OSId[] = ['reporting', 'seo', 'hr', 'finance']

export const OS_LIST: OSProduct[] = OS_ORDER.map((id) => OS_REGISTRY[id])

export function getOS(id: string | undefined | null): OSProduct | undefined {
  if (!id) return undefined
  return OS_REGISTRY[id as OSId]
}

export function isOSId(id: string | undefined | null): id is OSId {
  return !!id && id in OS_REGISTRY
}

/** Nav items grouped in declaration order, for the workspace sidebar. */
export function groupedNavigation(os: OSProduct) {
  const groups: { group: string; items: OSProduct['navigation'] }[] = []
  for (const item of os.navigation) {
    const key = item.group ?? 'General'
    const existing = groups.find((g) => g.group === key)
    if (existing) existing.items.push(item)
    else groups.push({ group: key, items: [item] })
  }
  return groups
}

export function findNavItem(os: OSProduct, sectionId: string) {
  return os.navigation.find((item) => item.id === sectionId)
}
