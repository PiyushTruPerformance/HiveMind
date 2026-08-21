/**
 * Platform identity. Everything user-visible about "who makes this product"
 * lives here so a white-label build changes one file.
 */
export const BRAND = {
  name: 'HiveX',
  productSuffix: 'OS',
  tagline: 'The operating system for your organization',
  description:
    'One identity, one organization, one subscription — every business system your team runs, under a single roof.',
  supportEmail: 'support@hivex.io',
  currency: 'USD',
  currencySymbol: '$',
} as const

/** Marketing copy reused across the sign-in split panel and the launcher hero. */
export const PLATFORM_PILLARS = [
  {
    title: 'One account, every product',
    body: 'Reporting, SEO, HR and everything that comes next share one login, one org and one bill.',
  },
  {
    title: 'Workspaces that carry context',
    body: 'Each OS keeps its own workspaces. Switch client, project or team without losing your place.',
  },
  {
    title: 'Ask Tru knows your scope',
    body: 'Ask across the whole organization or inside a single product. Ask Tru only ever answers from what you can access.',
  },
] as const
