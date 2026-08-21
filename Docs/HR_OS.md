# CV Analyzer

An AI-powered ATS (applicant tracking system). A recruiter creates a job, pastes or
uploads the job description, AI reads it and figures out what skills/experience/education
the role needs, and then recruiters upload candidate CVs — the system reads each CV
(even scanned PDFs), checks it against the job's requirements, scores it with AI, and
sorts candidates into Shortlisted / Review / Rejected, with an explanation for every score.

This document explains everything: what each piece does, how to set it up from a fresh
computer, where to get every API key, and the exact commands to run it. It's written so
someone with no coding background can follow it top to bottom.

---

## 1. What's actually in this project

Two separate programs that talk to each other:

| Folder | What it is | Built with |
|---|---|---|
| `backend/` | The "engine" — stores data, reads CVs, talks to AI services | Python (FastAPI) |
| `frontend/` | The website a recruiter actually sees and clicks around in | TypeScript (React) |

You run both at the same time on your own computer. The website (`frontend`) runs in
your browser at `http://localhost:5173` and talks to the engine (`backend`) running at
`http://localhost:8000`.

It also talks to five outside services, each needing its own account/API key:

| Service | What it's used for | Cost |
|---|---|---|
| **Vercel Blob** | Stores the uploaded CV files | Free tier |
| **Resend** | Sends status-update emails to candidates | Free tier (with a catch — see §6) |
| **Clerk** | Login / sign-in screen | Free tier |
| **OpenAI** | Reads job descriptions and scores resumes (AI) — the primary provider | Paid (gpt-4o-mini) |
| **Google Gemini** | Automatic fallback if OpenAI fails (quota, rate limit, outage) — or set as primary instead, see §6 | Free tier (with a daily limit — see §6) |

---

## 2. Before you start — install these three programs

Check if you already have them by opening **PowerShell** (search "PowerShell" in the
Windows Start menu) and typing each command below. If you see a version number, you
already have it and can skip that step.

```powershell
python --version
node --version
```

- **Python** (3.11 or newer) — if missing, download from [python.org/downloads](https://www.python.org/downloads/) and run the installer. ✅ Tick "Add Python to PATH" during install.
- **Node.js** (18 or newer) — if missing, download from [nodejs.org](https://nodejs.org/) (pick the "LTS" version) and run the installer with default options.
- **Tesseract OCR** (reads text out of scanned/image CVs) — install with:
  ```powershell
  winget install --id UB-Mannheim.TesseractOCR -e --accept-source-agreements --accept-package-agreements
  ```
  This installs it to `C:\Program Files\Tesseract-OCR\tesseract.exe` — the default config in this project already points there, so no extra setup needed if you used winget.

---

## 3. One-time setup

Open **PowerShell**, and navigate to the project folder (adjust the path if it's somewhere else):

```powershell
cd "C:\Users\User\Downloads\CV"
```

### 3a. Backend setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

What this does: creates an isolated Python environment just for this project (`.venv`),
turns it on (`Activate.ps1`), then installs every Python package the backend needs.
This takes a minute or two. You'll know it worked if the last line says something like
`Successfully installed fastapi ... openai ... google-genai`.

Now create your settings file:

```powershell
copy .env.example .env
```

Open the new `backend\.env` file in Notepad (or any text editor) and fill in the blank
values. **§6 below explains exactly how to get each one.**

### 3b. Frontend setup

Open a **second** PowerShell window (keep the first one open too), then:

```powershell
cd "C:\Users\User\Downloads\CV\frontend"
npm install
copy .env.example .env
```

This downloads all the website's dependencies (also takes a minute or two). The `.env`
file here usually doesn't need editing — see §6 for the one optional key (Clerk).

---

## 4. Running it (do this every time)

You need **two PowerShell windows open at the same time** — one for the backend, one
for the frontend. Leave both running while you use the app; closing either window stops
that half of the app.

**Window 1 — backend:**
```powershell
cd "C:\Users\User\Downloads\CV\backend"
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```
You'll know it worked when you see `Uvicorn running on http://127.0.0.1:8000`.

**Window 2 — frontend:**
```powershell
cd "C:\Users\User\Downloads\CV\frontend"
npm run dev
```
You'll know it worked when you see `Local: http://localhost:5173/`.

Now open your browser and go to: **http://localhost:5173**

To stop either one, click into that PowerShell window and press `Ctrl + C`.

---

## 5. How to use the app

1. **Sign in.** If you set up a real Clerk key (§6), you'll see a real sign-in screen
   (email or Google). If you left the Clerk key blank, it skips straight to the
   dashboard — fine for trying things out on your own computer.
2. **The stat cards at the top (Open jobs, Applications, Shortlisted, etc.) always
   match whatever's currently selected** — "All clients" shows totals across
   everything, clicking a client shows that client's totals, clicking a specific job
   narrows it down to just that job. Clicking a job's client again afterward goes
   back to that client's totals.
3. **The left sidebar is where clients and jobs live.** Under **CLIENTS**, "All
   clients" sits at the top, then one row per client, then an "Unassigned" row for any
   job with no client — each shows how many open roles it has out of its total
   (e.g. "3/5"), and clicking a client
   row expands/collapses its jobs nested underneath. This is just a grouping label for
   jobs (useful if you're hiring on behalf of multiple companies) — it has no effect on
   scoring or screening. Jobs with no client stay visible under "Unassigned" forever;
   you're never forced to assign one. The sidebar has its own scrollbar, independent of
   the page — it won't push the stats/table down no matter how many clients you add.
   Click the panel icon at the top of the sidebar to collapse it down to a thin strip
   (handy on a small screen, or if you just want the width back) — it remembers that
   choice next time you open the app. The app also remembers whichever job (or the
   "All clients" report) you were last looking at, so refreshing the page brings you
   back to exactly where you were instead of jumping to the most recently created job.
4. **(Optional) Create a client** — **"+ New client"** at the bottom of the sidebar.
   Each client row has a pencil (rename) and trash icon (delete — this only removes the
   client label; its jobs become "Unassigned," they're never deleted).
5. **Move a job to a different client by dragging it** — click and drag any job row
   onto a different client's row (or onto "Unassigned") to reassign it, no need to open
   the edit form. Works the same in both directions: out of "Unassigned" into a client,
   or back out of a client into "Unassigned." (Desktop only — there's no touch-drag
   support yet.)
6. **Create a job** — click **"+ New job"** under whichever client (or "Unassigned")
   you want it to belong to. A 3-step wizard opens:
   - **Step 1:** Job title, which client it belongs to, department, location,
     employment type, experience range, salary range.
   - **Step 2:** Paste the job description, or upload it as a PDF/DOCX/text file. Click
     **"Analyze with AI"** and Gemini reads it and figures out the required skills,
     preferred skills, education, etc. automatically — works for *any* role (software,
     chef, nurse, sales, whatever the JD says).
   - **Step 3:** Review what the AI extracted. Edit anything wrong, add anything it
     missed (each field has an "Add" box). Set the status to **OPEN** so it can accept
     CV uploads (or leave it as **DRAFT** to keep working on it first), then click
     **"Approve & create job."**
7. **Edit a job anytime** — click the pencil icon next to it in the sidebar to reopen
   the same wizard pre-filled with that job's data, including which client it's
   assigned to. This is how you change a job's status (e.g. DRAFT → OPEN so it can
   start accepting CVs), or edit the JD/requirements after creation. The trash icon
   deletes the job — only allowed while it has zero applications, otherwise set it to
   **ARCHIVED** instead. Clicking a job selects it — the top of the main panel shows a
   breadcrumb ("ClientName / Job Title") so you always know what you're looking at.
8. **Upload CVs** — click **"Analyze CVs"** (top right of the main panel). Pick a
   client to narrow the job list down (or leave it on "All clients" to see every open
   job), then pick the job (must be OPEN), select one or many CV files, click Upload.
   Each one shows live progress as it goes through OCR → parsing → scoring.
9. **Review candidates** — the table shows every candidate for the selected job with
   live status badges, an ATS score and an AI score column, and a dropdown (top right)
   to sort by **"Newest first," "Highest AI score,"** or **"Highest ATS score"** — handy
   once a job has more than a handful of applicants and you want the best fits first.
   **Click any row** to open the full detail view: contact info, a "View resume" button
   (opens the original file), both scores (see below), matched/missing skills, the AI's
   reason for the score, the raw OCR'd text, and a **Notes** box where you can jot your
   own commentary (e.g. "called candidate, salary expectation in range") — kept
   separate from the AI's own reasoning. Multiple notes stack up over time rather than
   replacing each other; hover any note to edit or delete it (an edited note shows
   "(edited)" so it's clear it changed). If a stage failed, a **"Retry"** button
   appears next to the failure reason — it re-runs just the part that failed (no need
   to re-upload the CV). If the **status email itself** failed to send (shown under
   "Email"), a small **"Resend"** link resends just the email without touching the
   application's status or score. A **"Delete application"** button at the bottom
   permanently removes that candidate's application (and the candidate record too, if
   this was their only one).
10. **Bulk actions** — check the box next to multiple candidates (desktop table view).
   Pick a status from the dropdown and click **"Apply"** to shortlist/review/reject (or
   move to interview/select/hire — see below) all of them at once (same as a single
   override, just for a batch — every selected candidate gets emailed individually).
   Click **"Delete"** instead to permanently remove all selected applications in one go.
11. **Search** — click **"Search CV"** to filter candidates by name/email/phone across
    *every* job, not just the one you're currently viewing. Click a result to open its
    full detail view, same as clicking a row in the table.
12. **All candidates report** — click **"All clients"** at the top of the sidebar to
    see every candidate across every job in one table, with a status filter dropdown
    and a sort dropdown (newest first, highest AI score, or highest ATS score). This
    view greets you by name ("Good Morning/Afternoon/Evening" + your first name, if
    you've signed in with a real account) at the top of both the header and the page.
    Click **"Export CSV"** (here, or on the per-job table) to download the currently
    filtered list as a spreadsheet — handy for sharing a shortlist outside the app.

**The two scores, and how a candidate ends up Shortlisted/Review/Rejected:**
- **ATS score (0-100)** — free, instant, deterministic keyword match against the job's
  required skills. This is just a pre-filter: candidates who match zero required skills
  never reach the paid AI step at all.
- **AI score (1-10)** — this is what actually decides the outcome: **9-10 → Shortlisted,
  7-8 → Review, 1-6 → Rejected.** The AI is deliberately strict about *evidence*, not
  just keywords — a resume that lists "Python, Docker, AWS" with nothing to back it up
  won't score well just because the words are there; it has to see real, substantiated
  experience (specific projects, duration, outcomes) to score high.
- **Candidates get an email automatically** for Shortlisted/Review/Rejected outcomes,
  with wording specific to each outcome — never a raw status code.

**Overriding a decision** — the AI can get it wrong. Open any candidate's detail view
and use the **"Recruiter override — decision"** buttons (Shortlist / Move to review /
Reject) to manually set the outcome regardless of what the AI decided — e.g. un-reject
someone the AI screened out too harshly. The candidate gets the normal status email for
the new outcome, same as if the AI had decided it, so they're always notified of the
current state of their application. The detail view also shows a small note ("Manually
overridden from REJECTED on...") so you can tell, later, that a decision wasn't the
AI's original call.

**Taking someone further in the hiring process** — once a candidate is shortlisted,
the **"Hiring progress"** buttons just below the decision ones let you move them
through **Interview → Selected → Hired**, in any order you need. The AI/ATS pipeline
never sets these on its own — they only exist for a recruiter to advance someone by
hand once a human conversation has actually happened, and each one sends the candidate
its own email ("you're invited to interview," "you've been selected," "welcome
aboard").

---

## 6. Getting each API key (the part that actually takes effort)

All of these go into `backend\.env` unless noted otherwise. Open that file in Notepad,
paste the value after the `=` sign (no quotes, no spaces), save, and restart the backend
window (`Ctrl+C` then re-run the `uvicorn` command) for it to take effect.

### Supabase (`DATABASE_URL`) — optional, moves data off your local computer
By default this app stores everything in a local SQLite file (`backend\cv_analyzer.db`) —
fine for trying it out, but the data only exists on this one computer and disappears if
that file is deleted. Supabase gives you a real, free, hosted Postgres database instead.
1. Go to supabase.com, sign up free, click **New Project** (pick a name, a database
   password, and a region), and wait ~2 minutes for it to provision.
2. Go to **Project Settings → Database → Connection string**, and switch to the
   **Session pooler** tab specifically — not "Direct connection" and not "Transaction
   pooler":
   - Direct connection's hostname (`db.<project-ref>.supabase.co`) only has an IPv6
     DNS record, which most home/ISP networks can't reach, so it'll fail with a
     `getaddrinfo failed` / "failed to resolve host" error.
   - Transaction pooler (port 6543) doesn't keep one stable database connection for
     the app's whole session — it can intermittently cause `current transaction is
     aborted` errors on unrelated requests once anything fails once. Session pooler
     (port 5432, same `*.pooler.supabase.com` hostname) doesn't have this problem.
3. Copy that connection string, replace `[YOUR-PASSWORD]` with your actual database
   password (the one from step 1 — if you don't remember it, there's a **Reset
   database password** option on that same page), and if the password has any special
   characters (`?`, `!`, `,`, `@`, etc.) in it, URL-encode them first or the connection
   string won't parse correctly.
4. Paste the result into `backend\.env` as `DATABASE_URL`, replacing the SQLite line
   (comment the SQLite line out with `#` rather than deleting it, in case you want to
   switch back later).

### Vercel Blob (`BLOB_READ_WRITE_TOKEN`) — stores CV files
1. Go to vercel.com and sign in (or create a free account).
2. Open or create a project, go to its **Storage** tab, click **Create Database → Blob**.
3. Once created, go to the store's settings / your Project Settings → Environment
   Variables, and copy the value next to `BLOB_READ_WRITE_TOKEN`.

### Resend (`RESEND_API_KEY`) — sends candidate emails
1. Go to resend.com and sign up (no credit card needed for the free tier).
2. Go to **API Keys** → **Create API Key** → copy it.
3. **Important catch:** without verifying your own sending domain, Resend will only
   actually deliver emails to *the email address you signed up with* — every other
   recipient gets a polite rejection. That's fine for testing, but for real candidate
   emails you'll eventually need to verify a domain at resend.com/domains and change
   `RESEND_FROM_EMAIL` in `.env` to an address on that domain.
4. Optional: set `COMPANY_NAME` in `backend\.env` (e.g. `COMPANY_NAME=Acme Inc.`) — it's
   used as the sign-off on every candidate email. Defaults to "the hiring team" if unset.

### Clerk (sign-in screen) — two keys, two files
1. Go to clerk.com, sign up, create an application.
2. Go to **API Keys** in the Clerk dashboard. Copy:
   - The **Secret key** (starts `sk_test_...`) → paste into `backend\.env` as `CLERK_SECRET_KEY`.
   - The **Publishable key** (starts `pk_test_...`) → paste into `frontend\.env` as `VITE_CLERK_PUBLISHABLE_KEY`.
3. For `CLERK_ISSUER` in `backend\.env`: take your publishable key, and Clerk's
   dashboard shows your "Frontend API" URL somewhere in API Keys/Domains — it looks
   like `https://your-app-name.clerk.accounts.dev`. Paste that in as `CLERK_ISSUER`.
4. **Leave both blank if you just want to try the app on your own machine** — without
   them, login is skipped entirely and you go straight to the dashboard.

### OpenAI (`OPENAI_API_KEY`) — primary AI provider
This is the default (`AI_PROVIDER=openai` in `backend\.env`), using gpt-4o-mini. Go to
platform.openai.com, add a payment method under **Billing**, create a key under
**API Keys**, paste it into `backend\.env` as `OPENAI_API_KEY`.

### Google Gemini (`GEMINI_API_KEY`) — automatic fallback (or free alternative)
1. Go to **aistudio.google.com/apikey**, sign in with any Google account.
2. Click **Create API key**. No credit card needed.
3. Paste it into `backend\.env` as `GEMINI_API_KEY`.

With both keys set, if OpenAI fails for any reason (quota, rate limit, an outage),
requests automatically retry against Gemini instead of failing outright — no action
needed, it just happens. If you'd rather use Gemini as the *primary* provider (e.g. to
avoid OpenAI costs entirely while testing), set `AI_PROVIDER=gemini` in `backend\.env`
— OpenAI then becomes the fallback instead. **Gemini's free tier limit:** only 20 AI
calls per day, and a request every few seconds at most — fine for trying the app out
or as a fallback, not enough for processing a real batch of CVs as the primary.

---

## 7. Troubleshooting

| Problem | What it means / what to do |
|---|---|
| `tesseract is not installed or it's not in your PATH` | Re-run the winget install command from §2, or check `TESSERACT_CMD` in `backend\.env` points to the right file. |
| Backend window shows `Address already in use` | Something's already running on port 8000. Close any other PowerShell window running the backend, or restart your computer. |
| Browser shows a blank page / can't connect | Make sure **both** PowerShell windows are still open and running (no errors), and that you're going to `http://localhost:5173`, not 8000. |
| `401 Unauthorized` on every action | You set a Clerk key in one `.env` file but not the other (both `backend\.env`'s `CLERK_ISSUER`/`CLERK_SECRET_KEY` and `frontend\.env`'s `VITE_CLERK_PUBLISHABLE_KEY` need to be filled in together, or both left blank). |
| AI scoring fails with "quota exceeded" / "429" | If only `GEMINI_API_KEY` is set (no OpenAI key, or `AI_PROVIDER=gemini` with no fallback configured): Gemini's free daily limit (20/day) is used up — wait until tomorrow, or add an `OPENAI_API_KEY` (§6) so it falls back automatically. If you're on the default `AI_PROVIDER=openai` and seeing this, it's actually OpenAI's quota, and Gemini's free tier should already be catching it as a fallback — check `GEMINI_API_KEY` is actually set. |
| Email always fails with "you can only send to your own address" | Expected on Resend's free tier without a verified domain — see §6. |
| `npm install` or `pip install` fails partway | Usually a flaky network blip — just run the same command again. |
| `.venv\Scripts\Activate.ps1 cannot be loaded because running scripts is disabled` | Windows blocks PowerShell scripts by default. Run this once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, type `Y` to confirm, then try activating again. |
| Everything looks broken — buttons don't work, nothing loads, no error makes sense | Check the frontend window's output for the actual URL it's running on. If you ever ran `npm run dev` twice without closing the first one, the second one silently moves to `http://localhost:5174` instead of `5173` — and the backend only accepts requests from `5173`, so every single thing fails. Close all the windows and start fresh with just one of each. |
| Backend crashes on startup with `failed to resolve host` / `getaddrinfo failed`, and `DATABASE_URL` points at Supabase | You're using the "Direct connection" hostname (`db.<project-ref>.supabase.co`), which is IPv6-only and won't resolve on most networks. Switch to the **Session pooler** connection string instead — see §6. |
| Backend crashes on startup with a Postgres auth/password error, and `DATABASE_URL` points at Supabase | Your database password likely has special characters that need URL-encoding (`?`, `!`, `,`, `@`, etc. aren't valid as-is inside a connection string) — see §6. |
| Loading candidates / applications intermittently fails with a 500, and the backend log shows `psycopg.errors.InFailedSqlTransaction` | `DATABASE_URL` is using Supabase's **Transaction pooler** (port `6543`) instead of the **Session pooler** (port `5432`, same hostname). Transaction-mode pooling doesn't guarantee one stable database connection per app session, which breaks SQLAlchemy's transaction handling — switch to port `5432` in `DATABASE_URL` and restart the backend. |

---

## 8. What this is *not* (yet)

Being upfront about scope, so nothing here is mistaken for more finished than it is:

- **Not deployed anywhere** — this only runs on your own computer right now (`localhost`). Putting it on the real internet (so other people can use it from their own browsers) is a separate, not-yet-done step.
- **No role-based permissions** — anyone who logs in can see and do everything; there's no "recruiter vs. admin" distinction yet.
- **No candidate self-apply portal** — candidates don't upload their own CVs through a public form; a recruiter uploads CVs on their behalf.
- **No screening questions or custom interview pipeline stages** — intentionally deferred, see `cv-analyzer-design-plan (1).md` for the original scope discussion.