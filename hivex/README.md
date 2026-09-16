# HiveX — Unified Multi-OS Platform (frontend)

The frontend for a unified business operating system: one login, one
organization, one subscription, multiple OS products, multiple workspaces per
product, and one permission-aware AI assistant across all of it.

**HR OS recruitment is live**, served by `services/hr-os` (the CV Analyzer ATS,
merged into this repo). Everything else runs on an API-shaped mock service
layer — no billing, no real OAuth. Every screen is navigable.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3005>.

HR OS also needs its service running — see the [repo README](../README.md):

```bash
cd ../services/hr-os && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

No environment file is required — with no Clerk key present the app runs in
**demo identity mode** and signs you in as a fixture user. To switch on real
authentication, copy `.env.local.example` to `.env.local` and set
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The same file sets
`NEXT_PUBLIC_HR_API_URL` if the HR OS service is not on port 8000.

**Ask Tru** runs against the live Tru Reporting services once Clerk is on and
`NEXT_PUBLIC_BASE_URL` (core API, `…/api/v1` — resolves the signed-in user via
`/users/me`) and `NEXT_PUBLIC_AI_BACKEND_URL` (AI service, `…/api/ai/v1`) are
set — the same variables the Tru Reporting client uses.

Other scripts:

```bash
npm run build
```

```bash
npm run typecheck
```

---

## The demo path

Sign in and you land on **Home** immediately — there is no onboarding wizard.
An organization is provisioned silently from your email domain and can be
renamed later in Settings.

From the landing page there are two entrances:

- **Explore the sample organization** — TruPerformance with Reporting OS
  already active, so you can go straight into a working product.
- **Start from scratch** — nothing is bought yet, so Home opens on the
  "Choose the OS that fits your workflow" prompt.

**The purchase funnel**, run per product:

```
Home → OS card → OS detail page → Choose → Pricing → Checkout → Setup → the product
```

Every stage has its own route under `/app/os/{osId}/`, and the guard resumes you
at the stage you stopped at rather than refusing entry.

Worth showing in a demo:

1. **Discovery before commitment** — clicking a product you have not bought
   opens its detail page, never an empty application.
2. **Contextual pricing** — plans are priced per product; the team-size question
   moves the "Best fit" badge, and every tier stays selectable.
3. **Setup is mandatory** — Enter is disabled until every required source is
   connected.
4. **Ask Tru placement** — present on Home and on a product's own pages, and
   completely absent (not hidden — unmounted) on any client page.
5. **Preview as role** (account menu) re-gates the whole application from one
   value.
6. **HR OS is real** — its clients, roles and candidates come from the service,
   not fixtures. Stop the service and HR OS says so instead of going blank.

"Reset demo data" in the account menu clears everything back to first-run.

---

## Where things live

```
src/
├─ platform/config/     OS registry, plans + per-OS pricing, activation funnel,
│                      Ask Tru availability, integrations, roles, brand
├─ platform/types/      Domain contracts shared by everything
├─ lib/
│  ├─ access/           Central authorization: permissions, entitlements, useAccess, <Can>
│  ├─ auth/             Clerk-or-demo mode flag
│  ├─ mock/             Fixtures (data/) + async services (services/)
│  ├─ state/            Providers: identity, platform, assistant, theme
│  └─ utils/            cn, formatters, namespaced storage
├─ components/
│  ├─ ui/               Design system primitives
│  ├─ shell/            Rail, top bar, sidebars, command palette, guards
│  ├─ assistant/        Universal assistant (dock, page, launcher)
│  ├─ integrations/     Catalog browser, connect flow
│  ├─ pricing/          Plan grid + purchase-funnel shell (pricing/checkout/setup)
│  ├─ home/             Launcher, recents, activity
│  ├─ os/               Generic OS building blocks
│  ├─ settings/ admin/  Platform administration
│  └─ common/
├─ os/                  OS-specific UI, one folder per product + registry.ts
│  ├─ hr/               HR OS — the ported CV Analyzer
│  │  ├─ api/           Typed client + React Query hooks for services/hr-os
│  │  ├─ components/    Job wizard, candidate drawer, CV upload, applications table
│  │  └─ workspace-source.ts   Maps service clients → platform workspaces
│  └─ workspace-sources.ts     Products whose workspaces come from a service
└─ app/                 Routes only — thin, no business logic
```

---

## Adding a new OS product

Three steps, no platform changes:

1. Add an entry to `src/platform/config/os-registry.ts` (identity, navigation,
   workspace noun, data sources, assistant prompts).
2. Add the product to the relevant plans' `includedOS` in
   `src/platform/config/plans.ts`.
3. Create `src/os/<id>/views.tsx` exporting a map of `navigation id → component`,
   and register it in `src/os/registry.ts`.
4. Add its per-tier pricing to `OS_PRICING` in `src/platform/config/plans.ts`.
5. If its workspaces come from a service rather than fixtures, add a loader to
   `src/os/workspace-sources.ts` — that is all HR OS needed.

The detail page, pricing page, checkout and setup step are generic: they read the
registry entry's `marketing` block and `requiredIntegrations`, so a new product
gets the whole funnel without a new route.

The rail, launcher, sidebar, router, command palette, access layer and assistant
all pick it up automatically.

---

## What is mocked

| Area | Status |
| --- | --- |
| **HR OS recruitment** | **Real** — `services/hr-os` via `src/os/hr/api/` |
| HR OS people ops | Fixtures, marked in-product with `<DemoModuleNotice>` |
| Authentication | Clerk when keys are present, local demo identity otherwise |
| Organization, members, Reporting/SEO workspaces | `lib/mock/services/platformService.ts` |
| Integrations, OAuth, discovery, sync | `lib/mock/services/integrationService.ts` |
| AI assistant responses | **Live** when Clerk + `NEXT_PUBLIC_BASE_URL` + `NEXT_PUBLIC_AI_BACKEND_URL` are set — the Tru Reporting AI service via `lib/assistant/`; otherwise `lib/mock/services/assistantService.ts` (local, streamed) |
| Reporting and SEO data | Deterministic fixtures in `lib/mock/data/` |
| Billing | Not implemented — plan changes update entitlements only |
| RBAC enforcement | Frontend only; the policy module is the seam for the real service |

Every mock service is async and returns the same types a real API would, so
replacing one is a change of implementation, not of callers. Endpoint
equivalents are noted in comments per function.
