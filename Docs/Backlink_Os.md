# AI Backlink Generator — TruPerformance

An AI-powered backlink outreach platform for SEO agencies. Discovers prospect sites, scrapes content, classifies link opportunities, scores relevance against client niches, finds contact emails, manages outreach campaigns, tracks follow-ups, and verifies live backlinks — all from a single dashboard.

**Live frontend:** https://ai-backlink-generator-two.vercel.app/

---

## What This Tool Does

Traditional backlink outreach is slow and manual: find sites, assess quality, write emails one by one, chase follow-ups. This tool automates the intelligence layer:

1. **Add prospect URLs** — paste one at a time or upload a CSV with hundreds at once
2. **AI pipeline runs automatically** — scrapes content, classifies site type, scores relevance against your client's niche, discovers contact emails
3. **Review and approve** the best prospects using filters, bulk actions, and relevance sorting
4. **Send personalised emails** to individual contacts or bulk-send via Excel upload
5. **Follow up automatically** — rules-based follow-up emails fire on a schedule via Celery Beat
6. **Verify backlinks are live** — one click checks whether the client's domain appears on the page
7. **Dashboard** shows pipeline health, outreach funnel, reply rates, and top sites by relevance

---

## Key Features

### Core Pipeline
| Feature | Description |
|---|---|
| **Multi-org auth** | Clerk v5 — each organisation sees only its own data; personal workspace for solo use |
| **Client & Campaign management** | Three-level hierarchy: Client → Campaign → Prospect Sites |
| **Campaign duplicate** | Clone any campaign (metadata only) with one click — the ⧉ button on campaign cards |
| **CSV site import** | Upload a CSV with a `url` / `domain` / `website` column — all sites queued automatically |
| **Domain blacklist** | Block domains permanently — auto-rejected on every future CSV import, zero manual review |
| **Full AI pipeline** | Per-site: scrape → classify → relevance score → find contacts, all in one background task |
| **Process All** | Queue the full pipeline for every site in a campaign; Skip ready toggle to re-run only failures |
| **Live pipeline status** | Queued → Scraping → Scoring → Ready / Failed; auto-refreshes every 3 s while in progress |
| **Pipeline counter** | X / N ready shown in the campaign header at all times |

### AI Intelligence
| Feature | Description |
|---|---|
| **AI Classification** | Labels each site: Editorial, Guest Post, Paid, Sponsored, Free, Link Exchange, Manual Review |
| **AI Relevance Scoring** | 0–100 score comparing prospect content to the client's niche; colour-coded green / amber / red |
| **AI Reasoning Popover** | Click any classification or score to read the full AI explanation |
| **AI email generation** | One-click personalised outreach email drafted from scraped content and client niche |
| **Keyword filter** | Search box queries scraped page content on the backend — find sites mentioning any keyword |

### Outreach & Follow-ups
| Feature | Description |
|---|---|
| **Contact discovery** | Crawls contact / about / team pages and extracts email addresses per site |
| **Individual email send** | Pick a template, preview the rendered email, click Confirm & Send — creates an OutreachRecord |
| **Bulk email via Resend** | Upload an Excel (.xlsx) contact list; sends in background, tracks per-recipient status |
| **Follow-up rules** | Per-campaign rules: "follow up N days after initial send using Template X" |
| **Automated follow-ups** | Celery Beat fires at 08:00 UTC daily, sends all due follow-up emails automatically |
| **Outreach tab** | Per-campaign view of every email sent with recipient, status, and timestamp |
| **Email performance dashboard** | Sent / Opened / Replied / Bounced breakdown with bar visualisation |

### Review & Management
| Feature | Description |
|---|---|
| **Status pipeline** | Move sites: Discovered → Approved → Contacted → Responded → Backlink Live / Rejected |
| **Site status history** | Timeline modal showing every status change: who made it, when, and why |
| **Bulk select & action** | Checkbox-select multiple sites; bulk Approve / Reject / Mark Contacted in one API call |
| **Auto-reject by score** | Set a relevance threshold — all sites below it are rejected in one click |
| **Backlink live verification** | Scrapes the prospect page and checks whether the client's domain appears — ✓ Live or ✗ Dead |
| **Inline DA / OPR editing** | Click the `—` in the OPR column to type a domain authority score manually |
| **Notes per site** | Click-to-edit text note on every row — persisted to the database |
| **Retry failed sites** | Per-row Retry re-queues the full pipeline for any failed or stuck site |
| **Edit client** | Pencil icon on client cards — edit name and target URL without leaving the UI |

### Filters & Export
| Feature | Description |
|---|---|
| **Sort & filter** | Filter by status, classification, minimum relevance; sort by relevance or date added |
| **Keyword content search** | Backend-powered keyword search across all scraped titles and body content |
| **Filter presets** | Save / load / delete named filter combinations (stored in localStorage) |
| **Export CSV** | Download the current filtered sites table as a spreadsheet |
| **Scrape data viewer** | Full modal showing title, meta, headings, and body for any scraped site |

### Dashboard
| Feature | Description |
|---|---|
| **Stat cards** | Clients, campaigns, sites (% ready), contacts, avg relevance score, emails sent |
| **Outreach funnel** | Horizontal bar chart of sites by pipeline stage |
| **AI pipeline breakdown** | Pie chart showing scraping / scoring / ready / failed proportion |
| **Top sites by relevance** | Leaderboard of best-scoring prospects with classification and campaign |
| **Date range filter** | Last 7 / 30 / 90 days or All time — applies to all dashboard charts simultaneously |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Recharts, React Router |
| Backend | Django 6 + Django REST Framework |
| Auth | Clerk v5 (JWT, multi-org) |
| Database | Supabase (PostgreSQL) |
| Background jobs | Celery 5 + Upstash Redis |
| Scheduled tasks | Celery Beat (daily follow-up runner at 08:00 UTC) |
| AI | OpenAI GPT-4o-mini |
| Email | Resend API |
| Scraping | Python `requests` + BeautifulSoup4 |

---

## Prerequisites

- **Python 3.11+** (3.14 matches the dev environment)
- **Node.js 20+** and npm
- **Supabase account** (free tier) — PostgreSQL database
- **Upstash account** (free tier) — Redis for Celery
- **Clerk account** (free tier) — Auth and multi-org
- **OpenAI API key** — gpt-4o-mini used by default
- **Resend account** — transactional / bulk email

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/dev-truperformance/ai-backlink-generator.git
cd ai-backlink-generator
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure environment

Create `backend/.env` (copy from `backend/.env.example`):

```env
DEBUG=True
SECRET_KEY=your-random-50-char-secret-key
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Clerk
CLERK_JWKS_URL=https://<frontend-api>.clerk.accounts.dev/.well-known/jwks.json
CLERK_SECRET_KEY=sk_test_...

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# Resend
RESEND_API_KEY=re_...
DEFAULT_FROM_EMAIL=you@yourdomain.com

# Redis (Upstash) — note rediss:// not redis://
REDIS_URL=rediss://default:...@...upstash.io:6379

# CORS — add your Vercel URL for production
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app

# Open Page Rank — optional, auto-fetches OPR 0-10 score per site
# New signups paused as of July 2025 (acquired by Keywords Everywhere)
OPEN_PAGE_RANK_API_KEY=
```

### 4. Database migrations

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
```

### 5. Start the backend

```bash
python manage.py runserver
# Running at http://localhost:8000
```

### 6. Start the Celery worker

Required for all background tasks (AI pipeline, bulk email, follow-up sending). Open a second terminal:

```bash
cd backend
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Mac/Linux

# Windows (no fork support):
celery -A config worker -l info --pool=solo

# Windows with parallel processing:
celery -A config worker -l info --pool=threads --concurrency=4

# Mac/Linux:
celery -A config worker -l info
```

### 7. Start Celery Beat (follow-up scheduler)

Required for automated follow-up emails. Open a third terminal:

```bash
cd backend
venv\Scripts\activate
celery -A config beat -l info
```

### 8. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

```bash
npm run dev
# Opens at http://localhost:5173
```

---

## Management Commands

### `assign_clients_to_org`

Migrates existing clients that have no organisation assigned to a specific Clerk org. Useful when onboarding existing data into a team workspace, or when switching from personal to multi-org mode.

```bash
cd backend
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Mac/Linux

# Auto-assigns if only one org exists:
python manage.py assign_clients_to_org

# Specify which org when multiple exist:
python manage.py assign_clients_to_org --org-id org_xxxxxxxxxxxxxxxx

# Preview what would change without writing anything:
python manage.py assign_clients_to_org --dry-run
python manage.py assign_clients_to_org --org-id org_xxx --dry-run
```

The Clerk org ID (`org_xxx...`) can be found in the Clerk dashboard under **Organisations**.

---

## Step-by-Step Usage

### Add a client

1. Click **+ New Client** (top-right header)
2. Enter client name and their website URL (e.g. `https://blog.python.org`)
3. The URL is used as the AI relevance reference — pick the page that best represents their niche
4. To edit later: click the **✏️** on the client card

### Create a campaign

1. Click into a client card
2. Click **+ New Campaign**
3. Give it a name (e.g. `Q3 Tech Blog Outreach`)
4. To duplicate an existing campaign: click the **⧉** icon on any campaign card

### Configure the domain blacklist (optional)

Before importing sites, block domains you never want to contact:

1. Open any campaign → click **Blacklist** in the header
2. Enter a domain (e.g. `spamsite.com`) and an optional reason
3. Click **+ Block**
4. Any future CSV imports will auto-reject matching domains — no manual review needed

### Add prospect sites

Inside a campaign, three ways to add sites:

- **Paste one URL** — type into the Add Site field and press Enter → queues full AI pipeline immediately
- **Import CSV** — click `Import CSV`, upload a `.csv` with a `url` column (supports hundreds of rows). Blacklisted domains are auto-rejected during import
- **Excel bulk email** — upload `.xlsx` with `[Email, Name, Organization]` columns for direct bulk sending

### Process All

Click **Process All** to queue the full AI pipeline for every site in the campaign:

1. OPR domain authority lookup (if API key configured)
2. Scrape — fetches page content, respects `robots.txt`
3. Classify — AI labels the site type and confidence level
4. Score relevance — 0–100 comparison vs client niche (requires client target URL)
5. Find contacts — crawls contact/about/team pages for email addresses

The **AI Pipeline** column shows live status (Queued → Scraping → Scoring → Ready / Failed) and auto-refreshes every 3 seconds. The **X / N ready** counter in the header updates in real time.

Enable **Skip ready** to re-run only failed or pending sites without reprocessing successful ones.

### Keyword search

Type any word into the **Keyword in content…** box in the filter bar. The backend searches scraped page titles and body content — useful for finding sites that already mention a topic or brand name.

### Domain Authority (OPR column)

- If `OPEN_PAGE_RANK_API_KEY` is set, the score (0–10) is fetched automatically during processing
- Otherwise: **click the `—`** in the OPR column to type a value manually (from Moz, Ahrefs, SEMrush)
- Press Enter or click ✓ to save

### Review and approve

- Click **✓** to approve (Discovered → Approved)
- Click **✗** to reject
- After approving, click **📧** to mark as Contacted
- Click **Got reply** to advance to Responded
- Checkbox-select multiple rows → bulk **Approve / Reject / Mark Contacted** in one API call

### Auto-reject by score

In the filter bar, enter a number in the `< score` box and click **✗ Auto-reject** to reject all sites below that relevance threshold in one action.

### Filter presets

1. Set your filters (status, type, min score, sort)
2. Click **Save filter** and give it a name
3. Load it any time from the **Presets…** dropdown
4. Delete unwanted presets from the **Delete…** dropdown

### Status history

Click the **History** button on any row to see a full timeline: every status change, who made it, when, and any notes attached.

### Add notes

Click the **add note…** text under any site to open an inline editor. Press Enter to save, Escape to cancel.

### Verify a backlink is live

Once a backlink is expected to be live, click **Verify Live** on the site row:

- **✓ Live** (green) — the client's domain was found in the page content
- **✗ Dead** (red) — the backlink is missing; click again to re-check at any time

### Send email to a contact

1. Click the **Contacts** button on any site (shows count if already discovered)
2. Click **Refresh** to discover contacts if none are shown yet
3. Pick a template from the dropdown
4. Click **Preview & Send** next to a contact — review the rendered email, then click **Confirm & Send**
5. Sends via Resend and creates an OutreachRecord; site status advances to Contacted automatically

### Set up follow-up rules

1. Inside a campaign, click **Follow-ups** in the header
2. Set **Delay (days)** — how many days after the initial email
3. Select the **Template** to use for the follow-up
4. Click **+ Add Rule**
5. Toggle any rule **Active / Paused** at any time
6. Celery Beat fires the follow-ups automatically every day at 08:00 UTC

### Bulk email (Excel)

1. Click **Send Bulk Email** at the top of the campaign
2. Pick an email template
3. Upload an `.xlsx` with columns: `Email`, `Name`, `Organization`
4. Background job sends all emails and updates statuses in real time

### AI email generation

Click **Email** on any row where the AI pipeline is Ready to generate a personalised outreach draft based on the scraped content and client niche. Copy, edit, or send directly.

### Dashboard

Click **Dashboard** in the sidebar. Use the date range tabs at the top to filter all stats simultaneously.

Charts:
- **Stat cards** — clients, campaigns, sites (% ready), contacts, avg relevance, emails sent
- **Outreach funnel** — sites by pipeline stage (horizontal bar)
- **AI pipeline** — pie chart of pipeline state breakdown
- **Top sites by relevance** — leaderboard of best prospects
- **Email performance** — sent / opened / replied / bounced

### Outreach tab

Inside any campaign, click the **Outreach** tab to see every email sent with recipient, status, and timestamp.

### Export

Click **Export CSV** to download the current filtered table as a spreadsheet with all visible columns.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | Django secret key (50-char random string) |
| `DEBUG` | No | `True` for dev, `False` for production |
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string (Session Pooler) |
| `REDIS_URL` | Yes | Upstash Redis (`rediss://...`) |
| `CLERK_JWKS_URL` | Yes | Clerk JWKS endpoint for JWT verification |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `OPENAI_API_KEY` | Yes | OpenAI key (classification, scoring, email generation) |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `RESEND_API_KEY` | Yes | Resend API key |
| `DEFAULT_FROM_EMAIL` | Yes | Verified sender address in Resend |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated frontend origins |
| `OPEN_PAGE_RANK_API_KEY` | No | OPR key — new signups paused (July 2025); use manual entry |

---

## API Reference

### Dashboard
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/dashboard/` | Aggregated stats (`?since=YYYY-MM-DD`) |

### Clients & Campaigns
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/v1/clients/` | List / create clients |
| `PATCH` | `/api/v1/clients/{id}/` | Edit client (name, target_url) |
| `GET/POST` | `/api/v1/campaigns/` | List / create campaigns (`?client=`) |
| `POST` | `/api/v1/campaigns/{id}/duplicate/` | Clone a campaign |
| `POST` | `/api/v1/campaigns/{id}/process-all/` | Queue full AI pipeline (`skip_ready` param) |
| `POST` | `/api/v1/campaigns/{id}/import-sites/` | Bulk import sites from CSV file |
| `POST` | `/api/v1/campaigns/{id}/bulk-email/` | Send bulk email from .xlsx |
| `POST` | `/api/v1/campaigns/{id}/scrape-all/` | Queue scrape for all sites |
| `POST` | `/api/v1/campaigns/{id}/score-all/` | Queue scoring for all sites |
| `GET` | `/api/v1/campaigns/{id}/jobs/` | List background jobs |

### Backlink Sites
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/v1/backlinks/sites/` | List / create sites (`?campaign=`, `?keyword=`) |
| `PATCH` | `/api/v1/backlinks/sites/{id}/` | Update site (notes, domain_authority, status) |
| `POST` | `/api/v1/backlinks/sites/bulk-action/` | Bulk status update (`action`, `site_ids[]`) |
| `POST` | `/api/v1/backlinks/sites/{id}/set-status/` | Update single site status |
| `GET` | `/api/v1/backlinks/sites/{id}/history/` | Status change timeline |
| `POST` | `/api/v1/backlinks/sites/{id}/verify-live/` | Check backlink is live on page |
| `POST` | `/api/v1/backlinks/sites/{id}/retry/` | Re-queue AI pipeline |
| `POST` | `/api/v1/backlinks/sites/{id}/scrape/` | Manually trigger scrape |
| `POST` | `/api/v1/backlinks/sites/{id}/classify/` | Manually trigger classification |
| `POST` | `/api/v1/backlinks/sites/{id}/score/` | Manually trigger relevance scoring |
| `POST` | `/api/v1/backlinks/sites/{id}/find-contacts/` | Discover contacts on site |
| `POST` | `/api/v1/backlinks/sites/{id}/send-to-contact/` | Send email to a specific contact |
| `POST` | `/api/v1/backlinks/sites/{id}/generate-email/` | AI-draft outreach email |

### Blacklist & Follow-ups
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/v1/backlinks/blacklist/` | List / add blocked domains |
| `DELETE` | `/api/v1/backlinks/blacklist/{id}/` | Remove a domain from blacklist |
| `GET/POST` | `/api/v1/backlinks/followup-rules/` | List / create follow-up rules (`?campaign=`) |
| `PATCH` | `/api/v1/backlinks/followup-rules/{id}/` | Toggle is_active, edit delay/template |
| `DELETE` | `/api/v1/backlinks/followup-rules/{id}/` | Delete a follow-up rule |
| `GET` | `/api/v1/backlinks/followup-records/` | List scheduled/sent follow-up records |

### Outreach
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/v1/outreach/templates/` | Email templates |
| `GET/POST` | `/api/v1/outreach/accounts/` | Email sending accounts |
| `GET` | `/api/v1/outreach/records/` | Outreach records (`?campaign=`) |
| `POST` | `/api/v1/webhooks/resend/` | Resend delivery event webhook |

### System
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health/` | Health check (no auth required) |

---

## Project Structure

```
SEO Backlink Generator/
├── backend/
│   ├── config/              # Django settings, URLs, Celery app, WSGI
│   ├── accounts/            # Custom User model + Clerk JWT auth backend
│   ├── organizations/       # Org isolation helpers
│   ├── clients/             # Client model + CRUD API
│   ├── campaigns/           # Campaign, BackgroundJob, DashboardView
│   ├── backlinks/           # BacklinkSite, WebsiteAnalysis, Contact, WebsiteContent
│   │   ├── models.py        # + BlacklistDomain, SiteStatusHistory, FollowUpRule, FollowUpRecord
│   │   ├── views.py         # + bulk-action, history, verify-live, blacklist, followup viewsets
│   │   ├── tasks.py         # auto_process, scrape_all, score_all, check_followups, verify_live_links
│   │   └── migrations/      # 0001–0007
│   ├── outreach/            # EmailAccount, EmailTemplate, OutreachRecord + Resend webhook
│   └── services/
│       ├── scraper.py            # robots.txt-aware scraper + encoding fix
│       ├── openai.py             # classify_website, score_relevance, generate_outreach_email
│       ├── contact_finder.py     # email harvester (contact/about/team pages)
│       ├── domain_authority.py   # Open Page Rank lookup (best-effort)
│       ├── excel.py              # .xlsx recipient parser
│       ├── email.py              # Resend send wrapper
│       └── template.py           # {{token}} template renderer
└── frontend/
    └── src/
        ├── api/client.js                  # apiFetch (Clerk JWT, auto-refresh on 401)
        ├── auth/                          # AuthContext, ProtectedRoute
        ├── pages/Login.jsx
        └── components/
            ├── sections/
            │   ├── ClientProjectList.jsx  # 3-level: Clients → Campaigns → Sites table
            │   ├── Dashboard.jsx          # Charts, date filter, stat cards
            │   ├── StatusHistoryModal.jsx # Timeline of status changes per site
            │   ├── BlacklistModal.jsx     # Manage blocked domains
            │   ├── FollowUpRulesModal.jsx # Per-campaign follow-up rule builder
            │   ├── BulkEmailModal.jsx
            │   ├── GenerateEmailModal.jsx
            │   ├── ImportSitesModal.jsx
            │   ├── EditClientModal.jsx
            │   └── ScrapeDataModal.jsx
            └── ui/
                ├── CardLargeView.jsx
                └── Pagination.jsx
```

---

## Production Deployment

### Frontend — Vercel

Set in the Vercel project dashboard under **Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | Your backend URL (e.g. `https://backlinkgenerator.tp-devserver.com/api/v1`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

### Backend — DigitalOcean (nginx + gunicorn + systemd)

The backend runs on a DigitalOcean Ubuntu server behind nginx as a reverse proxy.

**1. Clone and install**

```bash
cd /var/www/backlink-backend
git clone https://github.com/dev-truperformance/ai-backlink-generator.git .
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**2. Create `/var/www/backlink-backend/backend/.env`** (fill in your values).

**3. Migrate and collect static**

```bash
python manage.py migrate --no-input
python manage.py collectstatic --no-input
```

**4. Systemd service** (`/etc/systemd/system/backlink-gunicorn.service`):

```ini
[Unit]
After=network.target

[Service]
User=root
WorkingDirectory=/var/www/backlink-backend/backend
Environment="PATH=/var/www/backlink-backend/backend/.venv/bin"
ExecStart=/var/www/backlink-backend/backend/.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now backlink-gunicorn
```

**5. nginx** — proxy `/api/` to gunicorn, serve `/static/` from Django's `staticfiles/` directory. Add SSL via Certbot.

**6. Celery worker** — run as a separate systemd service (same pattern as gunicorn, command: `celery -A config worker -l info`).

**7. Celery Beat** — third systemd service for the daily follow-up scheduler (`celery -A config beat -l info`).

### Resend webhook

Register `POST https://your-backend.com/api/v1/webhooks/resend/` in the Resend dashboard under **Webhooks** to get live delivery / open / bounce events updating `OutreachRecord.status` automatically.

---

## Troubleshooting

**AI pipeline stuck at "Queued"**
The Celery worker is not running. Start it with `celery -A config worker -l info --pool=solo` (Windows) or `celery -A config worker -l info` (Mac/Linux).

**Celery crashes on Windows (WinError 5 / PermissionError)**
Windows doesn't support Unix `fork()`. Use `--pool=solo` or `--pool=threads --concurrency=4`.

**Follow-up emails not sending**
Ensure Celery Beat is running (`celery -A config beat -l info`). Check that follow-up rules are set to **Active** in the Follow-ups modal, and that outreach records exist for the campaign.

**"Couldn't scrape the client's site: robots.txt disallows..."**
The client's own site bypasses robots.txt (implied permission). Only prospect sites are checked. If this appears for a prospect, mark it rejected.

**Scrape fails with 403 or timeout**
Cloudflare-protected or paywalled sites actively block scrapers. Expected — reject the site and move on.

**Classification / relevance not showing**
Click **Retry** on the site row, or use **Process All**. Confirm the Celery worker is running.

**Celery can't connect to Redis**
Confirm `REDIS_URL` uses `rediss://` (not `redis://`) for Upstash TLS. The settings file automatically appends `?ssl_cert_reqs=CERT_NONE`.

**Verify Live shows ✗ Dead on a site I know has the link**
The scraper fetches the live page — if the backlink is in a JavaScript-rendered section, it may not appear in the raw HTML. Verify manually in that case.

**Stats bar shows stale numbers**
Navigate back and re-enter the campaign, or refresh the page. Stats re-fetch on every navigation event.

**Client created in one org appears in personal workspace**
Personal workspace filters by `organization=None` — org-assigned records never bleed through.

---

## Contributing

### Branch strategy

| Branch | Purpose |
|---|---|
| `main` | Production — always deployable; auto-deploys to DigitalOcean on merge |
| `dev` | Active development — all feature branches merge here first |

**Workflow:**
1. Branch off `dev`: `git checkout -b feature/my-feature dev`
2. Push and open a PR targeting `dev`
3. After review and merge into `dev`, open a PR from `dev` → `main` to release

Never push directly to `main`.

### Deploying to production

After merging to `main`, SSH into the DigitalOcean droplet and run:

```bash
cd /var/www/backlink-backend
git pull origin main
cd backend
source .venv/bin/activate
python manage.py migrate --no-input
python manage.py collectstatic --no-input
systemctl restart backlink-gunicorn backlink-celery backlink-beat
```

---

## Roadmap

- [ ] SEMrush automated site discovery (pending budget approval — endpoint stubbed)
- [ ] Resend webhook integration for open / click / bounce tracking
- [ ] Global search across all clients / campaigns / sites
- [ ] Server-side pagination for large campaign site lists
- [ ] Mobile-responsive layout
- [ ] RBAC — viewer / editor / admin role granularity
