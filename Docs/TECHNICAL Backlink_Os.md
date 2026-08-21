# Technical Documentation — AI Backlink Generator

This document covers system architecture, data models, API contract, background jobs, AI services, scraper, frontend architecture, auth flow, deployment, and design decisions. Intended for developers extending or maintaining the project.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Backend — Django Apps](#backend--django-apps)
4. [Data Models](#data-models)
5. [API Reference](#api-reference)
6. [Background Jobs (Celery)](#background-jobs-celery)
7. [AI Services Layer](#ai-services-layer)
8. [Scraper Service](#scraper-service)
9. [Email Service](#email-service)
10. [Frontend Architecture](#frontend-architecture)
11. [Authentication Flow](#authentication-flow)
12. [Database Migrations](#database-migrations)
13. [Environment & Configuration](#environment--configuration)
14. [Deployment](#deployment)
15. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       Browser                            │
│         React 18 + Vite + custom CSS (no Bootstrap)      │
│                  http://localhost:5173                    │
└───────────────────────┬──────────────────────────────────┘
                        │ JWT in Authorization header
                        │ REST/JSON
┌───────────────────────▼──────────────────────────────────┐
│               Django 6.0 + DRF 3.16                      │
│              http://localhost:8000                         │
│  /api/v1/auth/  /api/v1/clients/  /api/v1/campaigns/     │
│  /api/v1/backlinks/  /api/v1/outreach/                   │
│  /webhooks/resend/                                        │
└────────────┬─────────────────────────┬────────────────────┘
             │ psycopg2                │ Celery tasks
             │                         │ (Redis broker)
┌────────────▼──────────┐   ┌──────────▼───────────────────┐
│  Supabase PostgreSQL  │   │  Upstash Redis               │
│  (Session Pooler URL) │   │  rediss:// with TLS          │
└───────────────────────┘   └──────────┬───────────────────┘
                                       │
                            ┌──────────▼───────────────────┐
                            │  Celery Worker               │
                            │  (same Django codebase,      │
                            │   separate OS process)       │
                            └──────────────────────────────┘

External APIs:
  OpenAI gpt-4o-mini  →  classify / score / generate-email
  Resend API          →  send transactional & bulk emails
  Resend Webhook      ←  delivery event callbacks (opened/clicked/bounced)
```

---

## Project Structure

```
ai-backlink-generator/
├── README.md
├── TECHNICAL.md
├── docker-compose.yml         # backend + worker containers (local dev)
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── config/
│   │   ├── settings.py        # env-driven, single file
│   │   ├── urls.py            # mounts /api/v1/ + /webhooks/
│   │   ├── celery.py          # Celery app + autodiscover
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── core/
│   │   └── models.py          # TimeStampedModel, SoftDeleteModel (abstract)
│   ├── accounts/
│   │   └── models.py          # Custom User (extends AbstractUser)
│   ├── clients/
│   │   ├── models.py          # Client (target_url, target_content cache)
│   │   ├── serializers.py
│   │   └── views.py
│   ├── campaigns/
│   │   ├── models.py          # Campaign, BackgroundJob (progress_total/done)
│   │   ├── serializers.py
│   │   ├── views.py           # bulk-email, scrape-all, score-all actions
│   │   └── tasks.py           # (empty — tasks live in backlinks/outreach)
│   ├── backlinks/
│   │   ├── models.py          # BacklinkSite, WebsiteContent, WebsiteAnalysis
│   │   ├── serializers.py
│   │   ├── views.py           # scrape/classify/score/generate-email/set-status
│   │   └── tasks.py           # scrape_all_task, score_all_task
│   ├── outreach/
│   │   ├── models.py          # EmailAccount, EmailTemplate, OutreachRecord
│   │   ├── serializers.py
│   │   ├── views.py           # EmailAccountViewSet (stats action), OutreachRecord
│   │   └── tasks.py           # send_bulk_email_task
│   └── services/
│       ├── scraper.py         # scrape_website(url, respect_robots=True)
│       ├── openai.py          # classify_website, score_relevance, generate_outreach_email
│       ├── email.py           # send_email via Resend SDK
│       ├── excel.py           # parse_recipient_file (openpyxl)
│       └── template.py        # render_template ({{token}} substitution)
└── frontend/
    ├── .env.example
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx             # routes: /login + / (protected)
        ├── index.css           # global: body bg, font imports
        ├── api/
        │   └── client.js       # apiFetch: base URL, JWT header, auto-refresh
        ├── auth/
        │   ├── AuthContext.jsx  # login/logout/user state, session restore
        │   └── ProtectedRoute.jsx
        ├── pages/
        │   └── Login.jsx
        ├── components/
        │   ├── PageLayout.jsx   # sidebar + header + stats + tab routing
        │   ├── sections/
        │   │   ├── DashboardSidebar.jsx     # nav icons, profile, logout
        │   │   ├── DashboardHeader.jsx      # logo + New Client button
        │   │   ├── DashBoardStatsbar.jsx    # 6 live counters
        │   │   ├── ClientProjectList.jsx    # 3-level drill-down (clients→campaigns→sites)
        │   │   ├── EmailAccountsPanel.jsx   # email account cards + stats
        │   │   ├── CreateClientModal.jsx
        │   │   ├── CreateCampaignModal.jsx
        │   │   ├── GenerateEmailModal.jsx
        │   │   ├── BulkEmailModal.jsx
        │   │   ├── ManageEmailAccountsModal.jsx
        │   │   ├── ScrapeDataModal.jsx      # full scraped content viewer
        │   │   └── (CardLargeView, Pagination in ui/)
        │   └── ui/
        │       ├── CardLargeView.jsx
        │       └── Pagination.jsx
        └── css/
            ├── layout.css
            ├── dashboardSidebar.css
            ├── dashboardHeader.css
            ├── clientProjectList.css
            ├── createModal.css
            ├── scrapeDataModal.css
            ├── emailAccounts.css
            └── loader.css
```

---

## Backend — Django Apps

### `core`

Abstract base models only — no database tables of its own, no migrations.

- `TimeStampedModel`: `id` (UUID PK), `created_at`, `updated_at`, `created_by` (FK User, null)
- `SoftDeleteModel(TimeStampedModel)`: adds `is_deleted`, `deleted_at`; default manager excludes deleted rows

### `accounts`

- `User`: extends `AbstractUser`, integer PK (default Django auth). No extra fields at MVP.
- JWT auth via `djangorestframework-simplejwt`

### `clients`

- `Client(SoftDeleteModel)`: `name`, `target_url` (optional), `target_content` (JSONField, cached scrape), `target_content_scraped_at`
- `target_content` caches the client's homepage scrape so Score All doesn't re-fetch it N times

### `campaigns`

- `Campaign(SoftDeleteModel)`: FK Client, `name`, `status`
- `BackgroundJob(TimeStampedModel)`: FK Campaign, `job_type`, `status`, `celery_task_id`, `started_at`, `finished_at`, `error_message`, `progress_total`, `progress_done`
  - `progress_total`/`progress_done` are incremented per-item by Celery tasks so the frontend can show a live progress bar

### `backlinks`

- `BacklinkSite(TimeStampedModel)`: FK Campaign, `url`, `domain_authority`, `spam_score`, `source`, `raw_data` (JSON), `status` (7-state enum)
- `WebsiteContent(TimeStampedModel)`: FK BacklinkSite, `title`, `meta_description`, `headings` (JSON), `content` (5000-char truncated body), `content_hash`, `status_code`, `error`
- `WebsiteAnalysis(TimeStampedModel)`: FK BacklinkSite, `classification`, `confidence`, `relevance_score`, `authority_score`, `composite_score`, `reason`, `model_version`, `raw_response`
  - Multiple rows per site (history not overwrite)
  - `latest_analysis` SerializerMethodField returns the most recent row

### `outreach`

- `EmailAccount(TimeStampedModel)`: `provider` (resend/sendgrid/mailgun/gmail/outlook/smtp), `email_address`, `display_name`, `api_key` (write-only), SMTP fields, `is_active`, `daily_quota`
- `EmailTemplate(TimeStampedModel)`: `name`, `subject`, `body` (`{{recipient_name}}`, `{{organization}}` tokens)
- `OutreachRecord(TimeStampedModel)`: FK Campaign + BacklinkSite (nullable) + EmailAccount + Template, `recipient_email`, `recipient_name`, `organization`, `status` (10-state enum), `sent_at`, `last_event_at`

---

## Data Models — Relationships

```
User
 └─ owns → Client (created_by)
              └─ Campaign
                    ├─ BackgroundJob
                    ├─ BacklinkSite
                    │     ├─ WebsiteContent  (many, most recent = latest_content)
                    │     └─ WebsiteAnalysis (many, most recent = latest_analysis)
                    └─ OutreachRecord
                          ├─ BacklinkSite? (null for Excel-upload recipients)
                          └─ EmailTemplate?

EmailAccount  ← OutreachRecord (FK)
EmailTemplate ← OutreachRecord (FK)
```

---

## API Reference

Base path: `/api/v1/`

### Auth

| Method | Path                  | Description                         |
| ------ | --------------------- | ----------------------------------- |
| POST   | `auth/token/`         | Obtain access + refresh JWT         |
| POST   | `auth/token/refresh/` | Refresh access token                |
| GET    | `auth/me/`            | Current user info                   |
| GET    | `health/`             | `{"status":"ok"}` — unauthenticated |

### Clients

| Method | Path            | Description      |
| ------ | --------------- | ---------------- |
| GET    | `clients/`      | List all clients |
| POST   | `clients/`      | Create client    |
| GET    | `clients/{id}/` | Get client       |
| PATCH  | `clients/{id}/` | Update client    |
| DELETE | `clients/{id}/` | Soft-delete      |

### Campaigns

| Method | Path                                 | Description                          |
| ------ | ------------------------------------ | ------------------------------------ |
| GET    | `campaigns/?client={id}`             | List campaigns for a client          |
| POST   | `campaigns/`                         | Create campaign                      |
| GET    | `campaigns/{id}/jobs/`               | List background jobs                 |
| POST   | `campaigns/{id}/scrape-all/`         | Queue scrape-all job (202)           |
| POST   | `campaigns/{id}/score-all/`          | Queue score-all job (202)            |
| POST   | `campaigns/{id}/bulk-email/`         | Upload Excel + send (multipart, 202) |
| POST   | `campaigns/{id}/discover-backlinks/` | 501 (SEMrush not yet purchased)      |

### Backlink Sites

| Method | Path                                   | Description                                         |
| ------ | -------------------------------------- | --------------------------------------------------- |
| GET    | `backlinks/sites/?campaign={id}`       | List sites for campaign                             |
| POST   | `backlinks/sites/`                     | Add site manually                                   |
| GET    | `backlinks/sites/{id}/`                | Get site (includes latest_content, latest_analysis) |
| POST   | `backlinks/sites/{id}/scrape/`         | Scrape site (sync, returns WebsiteContent)          |
| POST   | `backlinks/sites/{id}/classify/`       | AI classify (sync, returns WebsiteAnalysis)         |
| POST   | `backlinks/sites/{id}/score/`          | AI score relevance (sync, returns WebsiteAnalysis)  |
| POST   | `backlinks/sites/{id}/generate-email/` | AI generate email (sync, returns {email})           |
| POST   | `backlinks/sites/{id}/set-status/`     | Update status field                                 |

### Outreach

| Method | Path                                  | Description                   |
| ------ | ------------------------------------- | ----------------------------- |
| GET    | `outreach/records/?campaign={id}`     | Outreach records for campaign |
| GET    | `outreach/email-accounts/`            | List email accounts           |
| POST   | `outreach/email-accounts/`            | Create email account          |
| PATCH  | `outreach/email-accounts/{id}/`       | Update email account          |
| DELETE | `outreach/email-accounts/{id}/`       | Delete                        |
| GET    | `outreach/email-accounts/{id}/stats/` | Per-account engagement stats  |
| GET    | `outreach/templates/`                 | List templates                |
| POST   | `outreach/templates/`                 | Create template               |

### Webhooks

| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| POST   | `webhooks/resend/` | Resend delivery event callback (no auth) |

---

## Background Jobs (Celery)

### Infrastructure

- **Broker**: Upstash Redis via `rediss://` (TLS). Settings auto-appends `?ssl_cert_reqs=CERT_NONE` to the result backend URL.
- **Worker**: `celery -A config worker -l info --concurrency 2`
- **Retry**: Per-task `autoretry_for` on transient errors (Resend 429s, network failures)

### Tasks

#### `scrape_all_task(campaign_id, job_id)`

1. Fetches all `BacklinkSite` rows for the campaign
2. Sets `BackgroundJob.progress_total = len(sites)`
3. For each site: calls `scrape_website()`, creates `WebsiteContent`, increments `progress_done`
4. Sites that fail robots.txt or network errors get a `WebsiteContent` row with `error` populated (not skipped silently)
5. Job ends `succeeded` even if some sites failed individually (failures listed in `error_message`)

#### `score_all_task(campaign_id, job_id)`

1. Scrapes the client's `target_url` once (with `respect_robots=False` — it's our own customer's site)
2. Caches on `Client.target_content` so re-runs skip the re-fetch
3. For each site with valid scraped content: calls `score_relevance()`, creates `WebsiteAnalysis`
4. Same progress tracking and per-item failure isolation as `scrape_all_task`

#### `send_bulk_email_task(job_id)`

1. Finds all `OutreachRecord`s linked to the job with status `scheduled`
2. Renders `EmailTemplate` body via `services.template.render_template()` (safe `{{token}}` substitution)
3. Sends via `services.email.send_email()` (Resend SDK)
4. Updates each record's `status`/`sent_at` individually — one failure doesn't abort the batch
5. Records Resend message ID in `OutreachRecord` for delivery tracking

### `BackgroundJob` progress fields

```
progress_total   int  — set to site count when task starts
progress_done    int  — incremented after each site is processed
```

The frontend polls `GET /campaigns/{id}/jobs/` every 2 seconds during a bulk op, reads these fields, and renders a live progress bar.

---

## AI Services Layer

### `services/openai.py`

All calls use `response_format={"type":"json_object"}` for reliable structured output.

**`classify_website(content: dict) -> dict`**

Input: `{title, meta_description, headings, content}`

System prompt defines all 7 categories with concrete signals:

- `paid` — explicit pricing/payment language
- `guest_post` — "write for us" / contributor guidelines
- `editorial` — curated independent content, no payment signal
- `sponsored` — explicit "sponsored"/"in partnership with" language
- `link_exchange` — reciprocal link or trade language
- `free` — free listing/directory
- `manual_review` — insufficient signal

Returns: `{classification, confidence (0.0–1.0), reason, raw_response}`

**`score_relevance(client_content: dict, prospect_content: dict) -> dict`**

Compares the client's site content against the prospect's content. Re-derives classification in the same call (one OpenAI call for both classification + relevance when scoring).

Returns: `{classification, confidence, relevance_score (0–100), reason, raw_response}`

**`generate_outreach_email(prospect_content, client_content, client_name) -> str`**

Generates a personalised cold-outreach email body referencing specific content from both sites.

---

## Scraper Service

### `services/scraper.py`

```python
def scrape_website(url: str, respect_robots: bool = True) -> dict
```

**robots.txt check** (`respect_robots=True`): Uses `urllib.robotparser`. Treat unreachable robots.txt as allow-all (standard convention). Raises `RobotsDisallowedError` on disallow.

**`respect_robots=False`**: Used exclusively when scraping the client's own `target_url` — we have implied permission from our customer. Prospect sites always use the default `True`.

**Encoding fix**: `requests` defaults `.encoding` to ISO-8859-1 when `Content-Type` omits charset. Overrides to `response.apparent_encoding` (charset-normalizer byte-level sniff) before reading `.text` — prevents mojibake in stored content.

**Extraction**:

- `<title>` text
- `<meta name="description">` content
- All `<h1>`–`<h3>` text (list)
- Body text with `<script>/<style>` stripped, truncated to 5000 chars
- SHA-256 `content_hash` of the truncated body

---

## Email Service

### `services/email.py`

Uses the official `resend` Python SDK (v2.32.2). One call per send:

```python
resend.Emails.send({
    "from": DEFAULT_FROM_EMAIL,
    "to": [recipient_email],
    "subject": subject,
    "html": html_body,
})
```

Returns the Resend message ID which is stored on `OutreachRecord` for delivery correlation.

### `services/template.py`

Safe `{{token}}` substitution via regex — not `str.format()` which breaks on stray braces in user-authored templates.

### Resend webhook (`/webhooks/resend/`)

Receives delivery events (`email.delivered`, `email.opened`, `email.clicked`, `email.bounced`). Matches by Resend message ID → `OutreachRecord`. Updates `status` and `last_event_at`. No authentication on this endpoint (Resend doesn't send auth headers in webhooks by default).

---

## Frontend Architecture

### State Management

No Redux/Zustand — all state is local `useState` in each component. The only cross-component signal is `refreshKey` in `PageLayout` (bumped via `onDataChanged` callback), which causes `ClientProjectList` and `DashBoardStatsbar` to refetch.

### `apiFetch` (`src/api/client.js`)

Thin wrapper around `fetch`:

1. Prepends `VITE_API_BASE_URL`
2. Attaches `Authorization: Bearer <access_token>` from localStorage
3. On 401: attempts one silent refresh via `POST /auth/token/refresh/`
4. If refresh fails: clears tokens, reloads to `/login`

### `AuthContext` (`src/auth/AuthContext.jsx`)

- `login(username, password)` → POST `/auth/token/` → stores tokens → fetches `/auth/me/` → sets user
- `logout()` → clears localStorage
- On mount: validates stored token via `GET /auth/me/`; clears and redirects on failure

### `ClientProjectList` — 3-level drill-down

```
level = "clients"   → fetches /clients/
level = "campaigns" → fetches /campaigns/?client={id}
level = "sites"     → fetches /backlinks/sites/?campaign={id}
                      also fetches /outreach/records/?campaign={id}
```

**Filters** (`processedItems` useMemo — no re-fetch):

- `searchQuery` — URL/name substring match
- `filterStatus` — exact status match
- `filterClassification` — `latest_analysis.classification` match
- `minRelevance` — `latest_analysis.relevance_score` ≥ threshold
- `sortByRelevance` — sort descending by relevance score

**Per-row action pattern**:

- `siteActionState[siteId]` — current loading action (`'scraping'|'classifying'|'scoring'|null`)
- `siteActionErrors[siteId]` — `{ message, action }` stored independently per row
- On error: red banner appears below the row with `friendlyError(msg)` + Retry button
- `friendlyError()` maps backend error strings to user-readable explanations

**Bulk background job polling** (every 2s during `bulkOp`):

- Fetches both `/campaigns/{id}/jobs/` AND `/backlinks/sites/?campaign={id}`
- Updates `items` live so rows update as they complete
- Reads `job.progress_done`/`job.progress_total` for the progress bar

**Bulk select**:

- `selectedSiteIds` Set, toggled per-checkbox
- Bulk Approve / Reject / Mark Contacted run parallel `set-status` calls then refetch all sites

### `ScrapeDataModal`

Shows full scraped content for a site: title, URL, meta description, headings list (scrollable), body text (scrollable pre block), HTTP status and scrape timestamp. Opened by clicking the site title in the Scraped column.

### `ReasonPopover`

Fixed-position overlay modal showing the full AI reasoning text from `latest_analysis.reason`. Opened by clicking any Classification or Relevance Score cell.

---

## Authentication Flow

```
Visit / without token
      │
      ▼
ProtectedRoute → redirect /login
      │
Login.jsx
POST /api/v1/auth/token/
      │
← { access, refresh }
      │
Store in localStorage
GET /api/v1/auth/me/
      │
← { id, username, email }
      │
Set AuthContext.user
      │
Redirect /
      │
PageLayout renders
```

Token expiry (default 60 min access / 7-day refresh):

```
apiFetch → 401
      │
POST /auth/token/refresh/
      │
← new access token (or 401)
      │
Retry original request
(or clear tokens + redirect /login)
```

---

## Database Migrations

| App           | Migration | Description                                                           |
| ------------- | --------- | --------------------------------------------------------------------- |
| accounts      | 0001      | Custom User model                                                     |
| organizations | 0001      | Organization model (clerk_org_id)                                     |
| clients       | 0001      | Client model                                                          |
| clients       | 0002      | target_content + target_content_scraped_at (client site cache)        |
| clients       | 0003      | Client.organization FK (multi-org isolation)                          |
| campaigns     | 0001      | Campaign model                                                        |
| campaigns     | 0002      | BackgroundJob model                                                   |
| campaigns     | 0003      | progress_total + progress_done on BackgroundJob                       |
| backlinks     | 0001      | BacklinkSite + WebsiteAnalysis (initial)                              |
| backlinks     | 0002      | WebsiteContent model                                                  |
| backlinks     | 0003      | BacklinkSite.ai_status field                                          |
| backlinks     | 0004      | Contact model                                                         |
| backlinks     | 0005      | BacklinkSite.notes field                                              |
| backlinks     | 0006      | BlacklistDomain, SiteStatusHistory, FollowUpRule, FollowUpRecord      |
| backlinks     | 0007      | FollowUpRecord/FollowUpRule created_by fields; unique_together update |
| outreach      | 0001      | EmailAccount + EmailTemplate + OutreachRecord                         |
| outreach      | 0002      | OutreachRecord: backlink_site nullable, add recipient_email/name/org  |
| outreach      | 0003      | EmailAccount.api_key field                                            |
| outreach      | 0004      | EmailAccount SMTP fields                                              |
| outreach      | 0005      | Add Resend to EmailAccount.Provider choices                           |

---

## Management Commands

### `assign_clients_to_org`

Assigns all `Client` rows that have `organization=None` to a specific Clerk org. Run this when existing data needs to be moved into an org workspace (e.g. after enabling multi-org mode, or after an initial solo-user setup).

```bash
cd backend && source .venv/bin/activate  # or venv\Scripts\activate on Windows

# Single org in DB — assigns automatically:
python manage.py assign_clients_to_org

# Multiple orgs — must specify:
python manage.py assign_clients_to_org --org-id org_xxxxxxxxxxxxxxxx

# Dry run — prints what would change, writes nothing:
python manage.py assign_clients_to_org --dry-run
```

The command errors clearly if no orgs exist yet (sign in with a Clerk org JWT first so the org auto-creates) or if `--org-id` doesn't match any known org.

---

## Environment & Configuration

All config is in `backend/.env` (gitignored). `backend/config/settings.py` reads via `django-environ`.

| Variable               | Required | Notes                                         |
| ---------------------- | -------- | --------------------------------------------- |
| `SECRET_KEY`           | Yes      | 50+ random chars                              |
| `DEBUG`                | Yes      | `True` dev / `False` prod                     |
| `DATABASE_URL`         | Yes      | Supabase Session Pooler URL (IPv4, port 5432) |
| `REDIS_URL`            | Yes      | Upstash `rediss://` URL                       |
| `OPENAI_API_KEY`       | Yes      | Used for classify/score/email                 |
| `OPENAI_MODEL`         | No       | Default: `gpt-4o-mini`                        |
| `RESEND_API_KEY`       | Yes      | Per-send and per-account                      |
| `DEFAULT_FROM_EMAIL`   | Yes      | Verified sender address                       |
| `CORS_ALLOWED_ORIGINS` | Yes      | `http://localhost:5173` for dev               |

**Supabase note**: The direct connection host is IPv6-only and fails on most ISPs. Always use the Session Pooler URL (ends in `:5432`, host contains `pooler.supabase.com`).

**Redis TLS note**: Upstash requires `rediss://`. Settings appends `?ssl_cert_reqs=CERT_NONE` to the result backend URL automatically — Celery's Redis result backend rejects `rediss://` without this parameter.

---

## Deployment

### Local

```bash
# Terminal 1 — Django API
cd backend && venv\Scripts\activate && python manage.py runserver

# Terminal 2 — Celery worker
cd backend && venv\Scripts\activate && celery -A config worker -l info
```

### Docker

`docker-compose.yml` at repo root:

- `backend` service: Gunicorn `config.wsgi:application` on port 8000
- `worker` service: same image, Celery command override

```bash
docker-compose up -d
```

Static files are collected into `backend/staticfiles/` during the Docker build (WhiteNoise serves them).

### DigitalOcean (production)

The backend runs as three systemd services behind nginx:

| Service             | Command                                                                            | Status                                          |
| ------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `backlink-gunicorn` | `gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --timeout 120` | Active                                          |
| `backlink-celery`   | `celery -A config worker -l info --concurrency 2`                                  | Inactive — start to enable AI pipeline          |
| `backlink-beat`     | `celery -A config beat -l info`                                                    | Inactive — start to enable scheduled follow-ups |

nginx reverse-proxies `/api/` and `/static/` to gunicorn and the collected static files directory respectively. SSL is provided by Certbot.

**Note:** `backlink-celery` and `backlink-beat` are currently stopped on the production droplet. Without them, the AI pipeline (Process All, scrape, classify, score) and scheduled follow-up emails will queue but never execute. Start and enable them with:

```bash
systemctl enable --now backlink-celery backlink-beat
```

### Deploying updates

SSH into the droplet (`ssh root@139.59.34.148`) and run:

```bash
cd /var/www/backlink-backend
git pull origin main

cd backend
source .venv/bin/activate
python manage.py migrate --no-input
python manage.py collectstatic --no-input
deactivate

systemctl restart backlink-gunicorn backlink-celery backlink-beat

# Verify
curl -s http://localhost:8000/api/v1/health/
```

If there are no new migrations, the `migrate` call is a no-op and safe to run regardless. Always restart gunicorn after a pull — it does not hot-reload.

### Branch strategy

| Branch | Purpose                                            |
| ------ | -------------------------------------------------- |
| `main` | Production — only merge here to release            |
| `dev`  | Active development — feature branches target `dev` |

Feature branches: `git checkout -b feature/name dev` → PR to `dev` → PR `dev → main` to deploy.

---

## Key Design Decisions

| Decision                               | Rationale                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| UUID PKs on all domain models          | Avoids sequential ID enumeration in API responses                                                                                            |
| SoftDelete on Client + Campaign        | Preserves historical outreach data even after "deletion"                                                                                     |
| Multiple WebsiteAnalysis rows per site | Preserves scoring history; re-scoring doesn't overwrite; model version comparisons survive                                                   |
| score() re-derives classification      | Avoids stale classification being overwritten silently; one OpenAI call covers both                                                          |
| Client.target_content cache            | Scoring N sites would otherwise re-scrape the client's homepage N times                                                                      |
| respect_robots=False for client site   | Client is our own customer — implied permission. robots.txt is for unwanted crawlers                                                         |
| Celery for bulk ops only               | Single-site actions (scrape/classify/score) are synchronous (~5s) and simpler; Celery overhead is only justified for N-item batch operations |
| progress_total/done on BackgroundJob   | Frontend polls every 2s; storing progress in DB means any process can read it (not just the Celery task itself)                              |
| Excel parse at request time            | Simpler than storing the file; parse-then-queue happens in <1s for typical files                                                             |
| `response_format=json_object`          | Eliminates OpenAI response parsing failures from free-text formatting                                                                        |
| friendlyError() on frontend            | Backend error strings contain technical details (robots.txt URL, exception class names) — map to user language at the boundary               |
