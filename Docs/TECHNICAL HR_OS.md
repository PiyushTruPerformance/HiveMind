# CV Analyzer — Technical Reference

This is the deep-dive doc: architecture, folder structure, database schema, the exact
processing pipeline, every service and what it does, the full API surface, the frontend
structure, auth flow, and the design system. For setup/run instructions written for a
non-technical reader, see **[README.md](README.md)**.

---

## 1. System architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   Frontend (React)  │ ──────▶ │   Backend (FastAPI)  │
│   localhost:5173     │  HTTP   │   localhost:8000      │
└─────────────────────┘         └──────────┬───────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
        ┌─────▼─────┐               ┌───────▼──────┐              ┌──────▼─────┐
        │  SQLite /  │               │ Vercel Blob  │              │   Resend   │
        │  Postgres  │               │ (CV files)   │              │  (emails)  │
        └────────────┘               └──────────────┘              └────────────┘
                                            │
                                  ┌─────────┴─────────┐
                                  │  Gemini / OpenAI   │
                                  │  (AI matching +    │
                                  │   JD extraction)   │
                                  └────────────────────┘

Auth: Clerk (frontend sign-in UI + backend JWT verification via JWKS)
OCR: Tesseract (local binary, no external API)
```

**Why this split:** FastAPI does all the actual work (parsing, scoring, storage); React
is purely a client. The frontend never talks to Vercel Blob, Resend, or the AI providers
directly — everything routes through the backend so API keys never reach the browser.

---

## 2. Folder structure

```
CV/
├── README.md                  — setup guide (non-technical)
├── TECHNICAL.md                — this file
│
├── backend/
│   ├── .env / .env.example     — secrets + config (see §8)
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py             — FastAPI app, CORS, router registration, table creation
│   │   ├── core/
│   │   │   ├── config.py       — Settings (pydantic-settings, reads .env)
│   │   │   └── clerk_auth.py   — require_auth() dependency, JWT verification via JWKS
│   │   ├── db/
│   │   │   ├── base.py         — SQLAlchemy declarative Base
│   │   │   ├── models.py       — Client, Candidate, Job, Application + all enums
│   │   │   └── session.py      — engine, get_db(), new_session() (see §3 for why NullPool)
│   │   ├── schemas/             — Pydantic request/response shapes (one file per resource)
│   │   ├── services/            — all business logic (see §5 for the full breakdown)
│   │   └── routers/             — HTTP endpoints (jobs.py, applications.py, clients.py, dashboard.py)
│   └── .venv/                   — Python virtual environment (not committed)
│
└── frontend/
    ├── .env / .env.example
    ├── package.json
    ├── public/
    │   └── tru-performance-icon.png  — sidebar logo mark, background-removed via flood-fill (see §7)
    └── src/
        ├── main.tsx             — entry point, mounts ClerkProvider conditionally
        ├── App.tsx              — routes (/  and /dashboard), ClerkApiBridge mount
        ├── index.css            — design tokens, fonts, glass/animation utilities (§10)
        ├── lib/
        │   ├── api.ts           — typed fetch client, every backend call lives here
        │   ├── auth.ts          — isClerkConfigured dev-bypass check
        │   ├── types.ts         — TS types mirroring the backend's Pydantic schemas
        │   ├── csv.ts           — toCsv()/downloadCsv(), shared by both export buttons
        │   ├── sort.ts          — sortApplications(), shared by ApplicationsTable + CandidatesReportView
        │   ├── greeting.ts      — timeOfDayGreeting(), shared by Greeting + DashboardHeader's breadcrumb
        │   └── utils.ts         — cn() class-merge helper
        ├── contexts/
        │   └── ThemeContext.tsx — light/dark toggle, persisted to localStorage
        ├── pages/
        │   ├── Landing.tsx      — "/" — sign-in entry point
        │   └── Dashboard.tsx    — "/dashboard" — owns selectedJobId + selectedClientId + showingReport state, persisted to localStorage
        ├── components/
        │   ├── layout/
        │   │   ├── PageLayout.tsx      — page shell: persistent collapsible sidebar (rail) + main column, ambient background layer
        │   │   └── DashboardHeader.tsx — main column's top bar: breadcrumb (client / job, or "All clients"), search/upload, theme toggle
        │   ├── ClientJobNav.tsx         — sidebar content: "All clients" + per-client groups with jobs nested inside (expand/collapse), create/edit/delete for both, drag-and-drop to reassign a job's client
        │   ├── ClientFormModal.tsx      — single-field (name) create/edit dialog for clients
        │   ├── JobCreationWizard.tsx    — 3-step job creation/edit flow
        │   ├── ApplicationsTable.tsx    — candidate table/grid, compact pipeline-status glyph, sort by score, bulk-select (status override or delete) + CSV export, responsive card fallback
        │   ├── PipelineGlyph.tsx        — compact 3-segment OCR/Parsing/AI indicator, replaces 3 separate badge columns in the table
        │   ├── CandidatesReportView.tsx — cross-job candidate report (status filter, sort by score, CSV export)
        │   ├── CandidateDetailDrawer.tsx— full candidate detail, recruiter status override (decision + hiring-progress stages), notes, retry-failed-stage, resend-email, delete
        │   ├── CVUploadModal.tsx        — client-filtered job picker, batch CV upload with per-file progress
        │   ├── CandidateSearchModal.tsx — client-side search across all jobs
        │   ├── StatusBadge.tsx          — color-coded status pill + StatusDot (dot-only variant for tight spaces), one semantic family mapping used everywhere
        │   ├── DashboardStatsBar.tsx    — the 6 stat cards, scoped to the selected client; Failed card alone escalates (color/weight/pulse) when non-zero
        │   ├── Greeting.tsx             — tagline shown only on the "All clients" view, below the header's own greeting
        │   ├── ClerkName.tsx            — render-prop wrapper around useUser(), shared by Greeting + DashboardHeader (see §7)
        │   ├── ClerkApiBridge.tsx       — bridges Clerk's getToken() into api.ts
        │   └── ui/                      — shadcn-style primitives (button, dialog, input, tag-list-input, etc.)
```

---

## 3. Database schema

Five tables. SQLite for local dev (`DATABASE_URL=sqlite:///./cv_analyzer.db`), swap to
Postgres for production by changing one env var — the SQLAlchemy models are
dialect-agnostic. Verified for real against Supabase's hosted Postgres (§7) —
`Base.metadata.create_all()` creates all five tables (plus native Postgres enum types
for every `Enum` column) with no model changes needed.

### `clients` — optional grouping label for jobs (e.g. an agency's hiring clients)
| Column | Type | Notes |
|---|---|---|
| `id`, `name` | — | name only, deliberately minimal — add fields later if a real need shows up |
| `created_at` | datetime | |

### `candidates` — one row per person, globally (not per job)
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (string) | |
| `name`, `email`, `phone` | string, nullable | filled in by the pipeline after OCR; see §4 step 3 |
| `blob_url` | string, nullable | private Vercel Blob URL of the original file |
| `created_at` | datetime | |

### `jobs`
| Column | Type | Notes |
|---|---|---|
| `id`, `title`, `jd` | — | `jd` is the source-of-truth text (pasted or OCR'd from an upload) |
| `status` | enum | `DRAFT`, `OPEN`, `PAUSED`, `CLOSED`, `ARCHIVED` — uploads only accepted when `OPEN` |
| `client_id` | string, nullable, FK → `clients.id` | **nullable on purpose** — a job isn't required to have a client, so the jobs that existed before this column was added didn't need a forced migration to some placeholder client. The frontend's "All clients" view always shows every job regardless of this field |
| `department`, `employment_type`, `work_mode`, `location`, `openings` | — | basic job metadata |
| `experience_min/max`, `salary_min/max` | int, nullable | |
| `jd_file_url` | string, nullable | if the JD was uploaded as a file rather than pasted |
| `required_skills`, `preferred_skills`, `responsibilities`, `education_requirements`, `certifications`, `languages`, `keywords`, `nice_to_have` | JSON (string arrays) | **structured requirements** — extracted from `jd` by AI, or hand-entered/edited by the recruiter. This is what ATS screening matches against (see §4 step 6 and §5 `jd_extraction_service`) |
| `jd_extraction_status` | enum | `PENDING`/`PROCESSING`/`SUCCESS`/`FAILED` |
| `jd_extraction_error` | string, nullable | populated on failure, same pattern as `applications.failure_reason` |
| `jd_extracted_at` | datetime, nullable | |

### `applications` — the join between a candidate and a job; status lives here, not on `candidates`
A given person can be `SHORTLISTED` on one job and `REJECTED` on another — that's why
status isn't on `candidates`.

| Column | Type | Notes |
|---|---|---|
| `id`, `candidate_id`, `job_id` | — | |
| `application_status` | enum | `UPLOADED → DUPLICATE / PARSED → SCREENED → SHORTLISTED / REVIEW / REJECTED → INTERVIEW → SELECTED → HIRED` |
| `ocr_status`, `parsing_status`, `ai_status` | enum | `PENDING`/`PROCESSING`/`SUCCESS`/`FAILED` — one per pipeline stage, independent of `application_status` |
| `email_status` | enum | `PENDING`/`SENT`/`FAILED` |
| `ocr_text` | text, nullable | full raw OCR output, shown in the candidate detail drawer |
| `ats_score` | int, nullable | 0-100, from the deterministic keyword match (§4 step 6) — pre-filter only, does not decide the outcome |
| `ai_score` | int, nullable | **1-10**, from AI matching (§4 step 7) — this is what actually decides Shortlisted/Review/Rejected, see §7 |
| `matched_skills`, `missing_skills` | JSON, nullable | from AI matching, not ATS screening — skills with *credible demonstrated evidence*, not just keyword presence (see §7) |
| `ai_reason` | text, nullable | human-readable explanation — either the AI's reasoning, or the "skipped, didn't meet ATS requirements" note |
| `failure_reason` | text, nullable | **accumulates**, never overwrites — see `append_failure()` in `pipeline.py`. A blob-storage failure and a later email failure both show up, not just the last one. Skips appending an exact repeat of the most recent note (clicking Retry/Resend repeatedly against the same persistent error doesn't pile up duplicates). Cleared per-stage on a successful retry (`clear_stage_failure()`) so a fixed error doesn't linger next to a now-successful result |
| `retry_count` | int | incremented on each stage failure (including failures during a manual retry) |
| `status_before_override` | enum, nullable | set only by a recruiter override (§7) — `None` for any status change the pipeline made on its own |
| `overridden_at` | datetime, nullable | set alongside `status_before_override` |
| `created_at` | datetime | |

**Why status is split into 4 separate enum columns instead of one:** so a candidate who
fails OCR is visibly `ocr_status=FAILED`, not just silently absent from results. This is
the single biggest design principle running through the whole backend — see §7.

### `notes` — a recruiter's own commentary on an application
| Column | Type | Notes |
|---|---|---|
| `id`, `application_id` | — | FK → `applications.id` |
| `text` | text | |
| `created_at` | datetime | |
| `updated_at` | datetime, nullable | set on edit; `null` until first edited (§7) |

Multiple notes per application, ordered by `created_at`, embedded directly in
`ApplicationOut.notes` rather than needing a separate fetch. Originally append-only
(no edit/delete) — that changed in §7; the `updated_at` column exists specifically
so an edited note still shows when it was edited, not just silently overwritten.

---

## 4. The processing pipeline (`app/services/pipeline.py::process_application`)

This runs once per uploaded file, as a FastAPI `BackgroundTask` (not in the request/response
cycle — the upload endpoint returns in milliseconds; everything below happens after).

```
1. Storage upload      → Vercel Blob (private store). Failure here is non-fatal —
                          we already have the raw bytes in memory, so OCR proceeds
                          regardless; the candidate just won't have a `blob_url`.
                          ↓
2. OCR                  → Tesseract, dispatched by file type (PDF pages rendered to
                          images via PyMuPDF, DOCX via python-docx, images directly,
                          plain text decoded). Runs on every file unconditionally.
                          ↓
3. Identity extraction  → regex first (email/phone patterns, "Name:" label, or a
                          Title-Case first line). If that comes up empty on name
                          and/or contact info, falls back to an LLM call. See §6.
                          ↓
4. Dedup                → global match on email OR phone across ALL candidates
                          (not scoped to this job). If matched AND an application
                          already exists for (that candidate, this job) → DUPLICATE,
                          stop here. If matched but it's a new job → merge onto the
                          existing candidate and continue.
                          ↓
5. Parsing               → deterministic, no LLM. Currently just extracts
                          experience_years via regex (skills/education extraction
                          moved to step 6 once ATS became JD-driven — see §7).
                          ↓
6. ATS screening         → deterministic, no LLM. Searches the raw resume text
                          directly for each of job.required_skills (using
                          skill_normalizer for alias matching — "Postgres" matches
                          "PostgreSQL"), plus an experience_min hard gate. Produces
                          ats_score. If it doesn't pass, decision is REVIEW/REJECTED
                          (per AUTO_REJECT_ENABLED) and AI matching is skipped
                          entirely — this is the cost gate, see §7.
                          ↓
7. AI matching            → only reached if step 6 passed. Real LLM call (Gemini or
                          OpenAI, see §6) scoring the resume against the full JD text
                          on a 1-10 scale. Deliberately rejects keyword-presence
                          scoring — see §7 ("rigorous AI matching"). Retries on
                          transient failures (429/503/timeout) with 2s/4s/8s backoff.
                          ↓
8. Decision               → score 9-10 → SHORTLISTED, 7-8 → REVIEW, 1-6 → REJECTED.
                          Unconditional for candidates who reached this step — the
                          AUTO_REJECT_ENABLED gate only applies to step 6 ATS-fail
                          candidates who never got an AI judgment at all (see §7).
                          ↓
9. Email                  → Resend, using a template specific to the outcome
                          (email_templates.py) — never the raw status enum or
                          internal score/reasoning. Failure is recorded, not fatal.
```

Every stage commits to the database independently — if the background task crashes
mid-pipeline, whatever already succeeded is preserved (not rolled back).

**Retrying a failed application** (`pipeline.py::retry_application`, triggered by
`POST /applications/{id}/retry`) re-enters this same pipeline without needing the file
re-uploaded — it doesn't redo work that already succeeded. `process_application` is
split into three reusable pieces (`_run_ocr`, `_run_identity_and_dedup`, `_run_scoring`)
specifically so retry can resume from the middle:
- If OCR already succeeded (`ocr_text` is already persisted), retry skips straight to
  `_run_scoring` (parsing → ATS → AI matching → decision → email) — by far the most
  common case in practice, since AI matching failures (rate limits, transient 5xx) are
  the dominant real-world failure mode, not OCR.
- If OCR never succeeded, retry re-downloads the file from `candidate.blob_url`
  (Vercel Blob) and redoes OCR + identity/dedup first, since those never had a chance
  to run the first time — then falls into `_run_scoring` the same way.
- Either way, every stage that succeeds on retry clears its own old failure note via
  `_clear_stage_failure()`, so a fixed error doesn't sit next to a now-correct result.

---

## 5. Backend services reference

| File | Responsibility |
|---|---|
| `ocr_service.py` | `TesseractOCRService.extract_text()` — dispatches by content-type/extension to PDF (PyMuPDF render → Tesseract), image (PIL → Tesseract), DOCX (python-docx), or plain text (direct decode) |
| `identity_extraction_service.py` | `extract_identity()` (regex) + `extract_identity_via_llm()` (fallback). The regex name heuristic rejects ALL-CAPS lines as "probably a job title" — tuned against 78 real resumes, but a known edge case: candidates whose actual name is styled in caps fall through to the LLM fallback |
| `dedup_service.py` | `find_existing_candidate()` — the global email-OR-phone match described in pipeline step 4 |
| `parsing_service.py` | `parse_resume()` — just `experience_years` now (see §7 for why skills moved out) |
| `ats_screening_service.py` | `screen()` — the deterministic, no-LLM gate. Takes raw resume text + `job.required_skills` directly (no fixed vocabulary) |
| `skill_normalizer.py` | `appears_in(term, text)` — alias-aware substring matching (Postgres/PostgreSQL, JS/JavaScript, k8s/Kubernetes, etc.) so ATS screening doesn't false-negative on terminology variance |
| `jd_extraction_service.py` | `extract_jd()` — LLM call that turns a raw JD into the structured fields on `Job` (§3). Pydantic-validates the response before anything touches the database |
| `ai_matching_service.py` | `LLMMatcher.score()` — the resume-vs-JD scoring call, 1-10 scale. Deliberately rigorous prompt — see §7. `AIMatchingError`/`AIMatchingTransientError` are re-exports of `llm_client`'s errors |
| `email_templates.py` | `build_status_email()` — candidate-facing HTML email per outcome (`SHORTLISTED`/`REVIEW`/`REJECTED`/`INTERVIEW`/`SELECTED`/`HIRED`, plus a generic fallback for anything else). Never exposes the raw status enum, AI score, or missing-skills reasoning to the candidate |
| `llm_client.py` | **Shared provider abstraction.** `call_structured(...)` calls a specific provider and returns parsed JSON; `call_structured_with_retry(...)` wraps it with the 2s/4s/8s backoff per provider, *and* falls back to the other configured provider if the primary fails entirely (§7) — one implementation, not three copies. `ai_matching_service`, `jd_extraction_service`, and `identity_extraction_service` all call through this — one place that knows about both providers' SDKs and exception types |
| `decision_engine.py` | `decide()` / `reject_or_review()` — score thresholds → `ApplicationStatus` (§7) |
| `storage_service.py` | `VercelBlobStorage` — real upload/download via the official `vercel` Python SDK, `access="private"` |
| `email_service.py` | `ResendEmailService` — real send via the `resend` SDK |
| `pipeline.py` | Orchestrates all of the above — see §4 |

**The `AI_PROVIDER` switch:** one line in `backend/.env`, picks the *primary*
provider — `openai` (paid, GPT-4o-mini) by default, `gemini` (free tier, a hard 20
requests/day cap, confirmed by hitting it during testing) as the alternative. Whichever
isn't primary becomes the automatic fallback if the primary fails (§7), as long as its
API key is also configured. All three LLM-calling services respect it automatically
since they all go through `llm_client.py`.

---

## 6. Identity extraction: regex vs. LLM fallback

Real-world resumes vary wildly in formatting. The cheap path (regex) handles the common
cases for free; the LLM fallback only fires when needed:

```python
identity = extract_identity(text)  # cheap, instant, no API call
if identity.name is None or (identity.email is None and identity.phone is None):
    # regex came up short — worth spending one LLM call
    llm_identity = extract_identity_via_llm(text)
    ...
```

Verified against 16 synthetic resumes with real names/emails: 16/16 emails, 15/16 names
correct via regex alone (the one miss was Tesseract misreading "ü" as "i", not a logic
bug). The LLM fallback exists specifically for resumes without a parseable header — most
of the Kaggle validation set fell into this category because that dataset's anonymization
strips real names/emails entirely (confirmed by reading full OCR output — there's
genuinely nothing there to extract, regex or LLM).

---

## 7. Key architectural decisions (and why)

- **ATS screening runs before AI matching and is 100% deterministic.** This is the cost
  gate — a candidate who matches zero required skills never reaches the paid AI step.
  Originally this ran against a hardcoded `SKILL_VOCABULARY` (~36 tech-only terms), which
  meant non-tech roles (chef, nurse, sales) always scored 0 regardless of actual fit.
  Fixed by making the JD itself the source of truth: `jd_extraction_service` reads any
  JD and produces `job.required_skills` dynamically, and `ats_screening_service` searches
  for those terms directly in the resume text. Verified against a chef JD with zero tech
  terms to confirm this actually works for non-software roles.

- **SQLite uses `NullPool`, not the default `QueuePool`.** Found via real load testing:
  a background task holds its DB session open for the entire
  pipeline (including slow OCR), so a small fixed pool gets exhausted under concurrent
  batch uploads (`QueuePool limit ... connection timed out`). SQLite connections are cheap
  to open (unlike Postgres' real server connections), so `NullPool` + `PRAGMA
  busy_timeout=30000` + WAL mode trades a fixed pool for one that scales with actual load.
  This is SQLite-only (`session.py`'s `_is_sqlite` check) — now that `DATABASE_URL` points
  at real Postgres (below), the default `QueuePool` applies instead, which is the correct
  choice there since Postgres connections aren't cheap to open the way SQLite's are.

- **Phone regex requires NANP-style 3-3-4 digit grouping**, not just "8+ digits with
  separators." The looser version matched date ranges like "2000 - 2003" as phone
  numbers — which could have falsely merged two unrelated candidates via dedup.

- **`failure_reason` accumulates, never overwrites.** A blob-storage failure followed by
  an email failure shows both, not just the last one. This was a real bug, found and fixed.

- **AI retries only on transient errors**, distinguished by real exception types from
  each provider's SDK (`RateLimitError`, `InternalServerError`, `ServerError`, or a 429
  status code) — not string-matching error messages. A malformed request or missing API
  key fails identically on every retry, so those raise immediately instead of wasting
  14 seconds on three guaranteed-to-fail attempts. All three LLM call sites (AI matching,
  JD extraction, identity extraction) share one retry implementation —
  `llm_client.call_structured_with_retry()` — instead of three independent copies that
  could drift out of sync; identity extraction didn't retry at all until a real 503 from
  Gemini surfaced as an unexplained "Unknown" candidate name in testing.

- **Rigorous AI matching, not keyword presence.** The original prompt just asked the
  model to identify matched/missing skills and score the overlap — which is exactly what
  the free ATS keyword gate already does, so the paid AI step added no real judgment. A
  2-line resume that was nothing but a bare skills list ("Skills: Python, FastAPI,
  Docker, AWS") scored a perfect 10/10 purely because the keywords were present. Fixed
  by rewriting the prompt to require evidence: the schema now includes a
  `depth_assessment` field the model must fill in *before* the score (forcing real
  reasoning rather than jumping straight to a number), and `matched_skills` now means
  "credibly demonstrated," not "the word appears." Verified the fix changes behavior:
  the identical thin resume dropped from 10/10 to 3/10, while a resume with genuine
  substantiated experience for the same skills still correctly scored 9/10.

- **Decision thresholds are on a 1-10 scale, not 0-100** (explicit product decision,
  2026-06-25): 9-10 Shortlisted, 7-8 Review, 1-6 Rejected — unconditional for any
  candidate who actually reached AI matching. `AUTO_REJECT_ENABLED` still matters, but
  only for the *other* rejection path: candidates who fail the deterministic ATS gate
  and never reach AI matching at all (`decision_engine.reject_or_review()`) — that
  policy question is still open per the original design doc's gate item #3.

- **Candidate emails use per-outcome templates (`email_templates.py`), never raw debug
  output.** The original implementation literally interpolated the enum value and AI
  reasoning into the email body (`f"Your application status: {application_status}"`)
  — functional, but exposed internal status codes and screening rationale directly to
  candidates. Replaced with distinct, professional copy per outcome.

- **Backend auth has a dev-bypass mirroring the frontend's.** When `CLERK_ISSUER` isn't
  set, `require_auth()` skips verification entirely — matches the frontend's behavior
  when `VITE_CLERK_PUBLISHABLE_KEY` isn't a real `pk_` key. Both default to "just work
  locally without needing real Clerk credentials," and both flip to real enforcement the
  moment real keys are present.

- **Editing an existing job reuses the creation wizard — there's no separate edit form.**
  `JobCreationWizard` always supported an optional `job` prop (pre-fills the form, calls
  `updateJob` instead of `createJob`), but the original job-pill list never gave the UI
  a way to pass one in — clicking a job pill only selected it. Fixed by adding a small
  pencil icon per pill that opens the same wizard in edit mode (now per job row inside
  `ClientJobNav`). Worth knowing if "editing" ever seems missing again: check whether
  the wizard supports it before assuming it needs to be built.

- **If the app seems completely broken (every request fails) but the backend responds
  fine to curl, check for a duplicate dev server on the wrong port.** Hit this for real:
  two `vite` instances ended up running at once (5173 and 5174, leftover from earlier
  testing), and the backend's CORS allowlist only had `5173` — so the browser silently
  blocked every API call from whichever tab landed on 5174, with a `400 Bad Request` on
  the CORS preflight as the only clue (visible in `backend/server.log`, not the browser
  console). `taskkill /F /IM node.exe` and restart clean if this happens again.

- **Cross-job reporting is a separate read model, not a filtered version of the per-job
  view.** `GET /applications` (no job filter) joins `Application` with `Job` via
  `joinedload` and stamps a transient `job_title` attribute onto each ORM object before
  Pydantic validation (`ApplicationWithJobOut` requires it, but it isn't a real column —
  setting a plain Python attribute on a SQLAlchemy instance doesn't get persisted, it's
  just there for the schema to read). Both the per-job table and the all-jobs report
  build their own CSV client-side via `lib/csv.ts` (`toCsv`/`downloadCsv`) — small enough
  that a shared utility was right, but the column sets differ (per-job export omits the
  `Job` column since it's implied), so each lives in its own component.

- **Recruiter override is a separate endpoint from the pipeline's own status-setting,
  not a reused code path.** `PATCH /applications/{id}/status` lets a recruiter force an
  application straight to `SHORTLISTED`/`REVIEW`/`REJECTED`, bypassing the AI/ATS
  decision — added because the AI can be wrong, and there was no way to reverse an
  auto-rejection short of editing the database directly. It deliberately rejects any
  other `ApplicationStatus` value (`MANUAL_OVERRIDE_STATUSES` in `applications.py`) so a
  recruiter can't manually force a pipeline-internal state like `SCREENED` or `PARSED`,
  which would desync `application_status` from the stage-status columns that are
  supposed to mirror real pipeline progress. On override it sends the same
  `email_templates.py` status email the automated pipeline would for that status —
  the candidate is notified of the *current* decision either way, automated or
  human-reversed, with no separate "this was a manual override" wording (not worth the
  extra template surface for what the candidate needs to know). `append_failure()` was
  promoted from a `pipeline.py`-private helper to a shared one so this endpoint's email
  failures accumulate into `failure_reason` the same way the pipeline's do.

- **Bulk status override reuses the single-override logic and its same status
  restriction — not a separate, more permissive path.** `PATCH
  /applications/bulk-status` (`applications.py`) takes a list of application ids and one
  target status, and is gated by the exact same `MANUAL_OVERRIDE_STATUSES` set as the
  single endpoint. Both call a shared `_apply_status_override()` helper so the
  status-set + email-send + failure-accumulation logic can't drift between the two
  call sites. The frontend scopes "select all" to the current page only
  (`ApplicationsTable.tsx`) — selecting across all pages of a large job would need a
  separate bulk-by-filter endpoint, which wasn't worth building until a real job has
  enough applications to need it.

- **Clients are a thin, optional label on jobs — not a tenant boundary.** `client_id` on
  `jobs` is nullable specifically so existing jobs (created before clients existed)
  never need a forced migration to a placeholder client, and the frontend's "All
  clients" row always shows every job unfiltered regardless of this field — a
  recruiter who never touches the client feature sees no behavior change at all. There
  is no client-level access control or data isolation; it's purely a grouping label for
  recruiters who hire across multiple companies, not a multi-tenancy mechanism. A new
  job inherits whichever client is currently selected in `ClientJobNav`
  (`JobCreationWizard`'s `clientId` prop), but it's just the initial value — the same
  "Client" field is editable on every subsequent edit too (via the wizard's `<select>`,
  or by dragging the job onto a different client in the sidebar, §7), with no special
  reassignment-only endpoint — both go through the normal `PATCH /jobs/{id}`.

- **Deletes are scoped to what's actually safe to lose, not a blanket DELETE per
  resource.** `DELETE /jobs/{id}` 409s if the job has any applications — applications
  are the valuable data, so a job with real candidates attached should be `ARCHIVED`
  (already supported), not destroyed; only an empty/mistaken job can be hard-deleted.
  `DELETE /clients/{id}` never deletes jobs — it sets their `client_id` back to `NULL`
  and deletes only the client row, consistent with clients being "just a label" (above).
  `DELETE /applications/{id}` also deletes the candidate row, but only if this was
  their last application anywhere (`candidates` is global, not per-job — see §3) —
  otherwise it would delete a person who's still a candidate on a different job.

- **Recruiter overrides record a one-level audit trail (`status_before_override`,
  `overridden_at`), not a full history log.** Enough to answer "was this decision the
  AI's or a human's, and when did that change" — which is what actually matters when
  revisiting a decision later — without building out a generic event-log table for a
  single use case. Both the single and bulk override endpoints set these two fields
  in the same `_apply_status_override()` helper they already shared, so there's no
  separate code path to keep in sync. Recruiter *identity* (who overrode it) isn't
  captured — `require_auth()`'s JWT payload is verified but never threaded into the
  route handlers, and in dev-bypass mode (no real Clerk key) there's no identity to
  capture anyway, so it wasn't worth the plumbing for what's logged today.

- **Search became cross-job instead of gaining a "search everywhere" toggle.**
  `CandidateSearchModal` used to take a `jobId` and search only within it; changed to
  always call `GET /applications` (the same cross-job endpoint the report view uses)
  and show each result's job title inline. The per-job `ApplicationsTable` is still
  there for browsing within a job's context, so dropping the job-scoped mode from
  search specifically didn't remove any capability — it just stopped making "find this
  one candidate" depend on having already picked the right job first. Search results
  are clickable too — selecting one closes the search `Dialog` first, then opens
  `CandidateDetailDrawer` for that application, rather than nesting two Radix dialogs
  at once (simpler focus-trapping/z-index, and the search modal stays mounted with
  `open={false}` rather than unmounting, so its local state survives the handoff).

- **CSV exports (both per-job and cross-job) include `status_before_override` /
  `overridden_at`.** Added once those columns existed (§3, §7) — without them, a
  recruiter exporting data to share outside the app would have no way to tell a
  decision the AI made from one a human reversed, defeating part of the point of
  having an audit trail at all.

- **Resending a failed email is a separate endpoint from overriding status, not a
  side effect of one.** `POST /applications/{id}/resend-email` only touches
  `email_status` (and `failure_reason`) — it rebuilds and re-sends whatever email
  matches the application's *current* `application_status`, without re-deciding
  anything. Before this existed, the only way to retry a failed send was a status
  override, which works but re-decides the outcome as a side effect just to get the
  email to fire again — wrong tool for "the decision was right, the email just didn't
  go out" (the actual common case, given the Resend sandbox-domain restriction).

- **Bulk delete mirrors the single-delete endpoint's semantics exactly, applied to a
  batch.** `POST /applications/bulk-delete` (POST, not DELETE, because a request body
  on DELETE isn't reliably supported across HTTP clients — same reasoning as
  `bulk-status`) deletes each application, then separately sweeps every distinct
  `candidate_id` touched by the batch and removes any candidate left with zero
  applications anywhere — not just zero within the batch, since a candidate could
  still have an application on a job outside the selected set.

- **`append_failure()` now skips an exact repeat of the most recent note.** Found
  while testing the resend-email feature: clicking "Resend" repeatedly against the
  same persistent error (e.g. the Resend sandbox restriction) appended an identical
  message every time, turning `failure_reason` into a wall of duplicate text. The fix
  only de-duplicates *consecutive* identical notes — a genuinely different failure
  (a different stage, or the same stage failing a different way) still gets recorded,
  preserving the original "never silently lose a failure" intent.

- **Dashboard stats take an optional `client_id` filter, computed from the same base
  queries rather than a second code path.** `GET /dashboard/stats?client_id=X` filters
  `jobs` directly and joins `applications` through `jobs` when a client is given;
  with no `client_id`, both queries are unfiltered, so the "All clients" view's
  behavior is byte-for-byte what it was before this existed. Found via actual testing
  that the stat cards previously stayed global no matter which client was selected in
  `ClientsBar` — the job bar filtered but the stats didn't follow, which read as a bug
  once clients became a real navigation axis.

- **`CVUploadModal` gained its own client filter, mirroring the sidebar's client →
  job grouping, rather than relying on its job dropdown alone.** The modal's job list
  was never actually filtered by client (`api.listJobs()` is unscoped, then filtered to
  `OPEN` client-side) — it always showed every open job regardless of which client was
  selected on the main dashboard. That's correct in the sense that nothing was
  *missing*, but once jobs started spreading across clients, a flat job-title list
  with no client context became hard to navigate. The modal now defaults its client
  filter to whichever client is selected on the dashboard (`defaultClientId` prop,
  same pattern as the existing `defaultJobId`), and re-picks the first still-visible
  job whenever the filter changes.

- **Status badges are driven by meaning (a `Family`), not by the raw status value.**
  `StatusBadge.tsx`'s old mapping styled each of the ~20 status values independently,
  which meant `DUPLICATE` and `PENDING` ended up with the identical gray — a real
  semantic collision (a dead-end vs. a not-yet-started state look the same). Replaced
  with a `STATUS_FAMILY` map collapsing every status into one of six meanings
  (`success`/`active`/`failure`/`deadEnd`/`info`/`pending`), each with one consistent
  look: a filled pill for anything *decided* (success/active/failure/info/deadEnd), a
  dashed-outline pill for `pending` specifically — "nothing has happened yet" is a
  different *shape*, not just a paler fill, so it can't be confused with a resolved
  dead-end. `deadEnd` (`DUPLICATE`/`CLOSED`/`ARCHIVED`) got a new hue, "Dusk Violet"
  (`--dead-end` token, §10), since neither existing color family fit. A small leading
  dot reinforces the family for colorblind users; `StatusDot` exports just that dot for
  places too tight for a full pill (the sidebar's job rows).

- **The applications table shows one compact pipeline glyph, not three status
  columns.** OCR/Parsing/AI used to render as three separate `StatusBadge` columns at
  equal visual weight with Candidate/Status/ATS score — correct, but a recruiter
  scanning the table for "who needs a Retry" had to read three pills per row. Considered
  moving pipeline detail out of the table entirely (it's already fully shown in
  `CandidateDetailDrawer`), but that would've buried the "did anything fail" signal
  behind a click per row, defeating the point of the Retry feature being discoverable
  at a glance. `PipelineGlyph.tsx` compromises: three small colored segments in one
  column, with a `title` tooltip giving the per-stage text on hover, full detail still
  only in the drawer.

- **Exactly one stat card is allowed to look different, and only when it has
  something to say.** All 6 cards used to carry an individual colored top-border
  regardless of value — decorative, not informative (every card always "stood out" a
  little, so nothing actually did). Replaced with a single rule: all six render
  identically by default; only `Failed` escalates (red border + wash + larger bold
  number + a one-time `alarm-card` pulse, `prefers-reduced-motion`-safe) and only when
  `failed > 0`. At zero it's indistinguishable from its calm neighbors — the goal was
  hierarchy when it matters, not a permanently "loud" dashboard.

- **The client/job picker moved from two horizontal pill bars into one persistent
  sidebar.** The original `ClientsBar` (client pills) + `JobsBar` (job pills, filtered
  by selected client) both lived inline above the page content. That broke down once
  `ClientJobNav` switched to showing every client as an always-visible, expandable
  block (so a recruiter could see open-role counts across clients at a glance,
  instead of one client at a time) — several expanded clients stacked vertically
  pushed the stat cards and table further down the page the more clients/jobs existed,
  with no upper bound. A sidebar with its own independent scroll (`overflow-y-auto`,
  full viewport height at `lg:` and up) decouples nav height from content height
  permanently — ten clients with five jobs each just makes the sidebar scroll, the
  main column never moves. `PageLayout.tsx` went from a single `flex-col` stack to
  `flex-col lg:flex-row` (sidebar stacks above content below the `lg` breakpoint,
  since there's no "rail" concept worth keeping on a narrow screen). The old
  `ClientsBar`/`JobsBar` were deleted outright rather than kept as dead code —
  `ClientJobNav` absorbed both responsibilities (client grouping + job listing) into
  one component since the sidebar renders them as a single nested tree, not two
  independent lists.

- **The header's old "All candidates" toggle button became the sidebar's "All
  clients" row instead of staying a separate control.** Once the sidebar already
  lists every client, adding a *second* place to reach the cross-job report (a header
  button) would've been a redundant entry point for the same `showingReport` state.
  `DashboardHeader`'s prop changed from `onToggleReport: () => void` to a read-only
  `showingReport: boolean` (it now only *displays* a breadcrumb reflecting that state);
  `PageLayout`'s prop changed from `onToggleReport` to `onShowAllClients: () => void`
  — a one-way setter, not a toggle, because the sidebar's "All clients" row should
  always *enter* the report view on click, never flip it off (you leave the report
  view by clicking any job, same as before).

- **The breadcrumb fetches its own job/client data independently rather than sharing
  `ClientJobNav`'s already-fetched lists.** `DashboardHeader`'s `Breadcrumb`
  subcomponent calls `api.getJob()` + `api.listClients()` directly whenever
  `selectedJobId` changes, duplicating fetches the sidebar already made. Lifting a
  shared jobs/clients store up to `Dashboard.tsx` would be the "proper" fix, but this
  app already has precedent for small redundant fetches over shared state
  (`ApplicationsTable` independently re-fetches its own job title for the CSV
  filename) — consistent with that, and avoids restructuring data flow for a
  one-line breadcrumb.

- **The sidebar collapses to a thin icon strip, not off-screen, and remembers the
  choice.** `PageLayout.tsx` holds a `collapsed` boolean (`localStorage`-persisted,
  same pattern as `ThemeContext`), toggling the sidebar between `lg:w-72` and
  `lg:w-16`. Collapsing hides `ClientJobNav` entirely but keeps the header row (logo +
  expand button) visible, so there's always an obvious way back — unlike fully hiding
  the rail, which would've needed the toggle to live somewhere else (the main header)
  once its usual home disappeared.

- **Jobs are reassigned between clients by dragging them in the sidebar, using
  native HTML5 drag-and-drop rather than a library.** Each job row is `draggable`;
  each client/"Unassigned" group header is a drop target (`onDragOver` calling
  `preventDefault()` to allow the drop, `onDrop` doing the actual move). A no-op guard
  skips the API call entirely if a job is dropped back onto the group it's already in.
  No new dependency was pulled in (`@dnd-kit`/`react-dnd`) since there's exactly one
  draggable type and one drop-target type — native DnD's rough edges (manual
  `dragover`/`dragleave` bookkeeping for the highlight state) are cheap at this scale.
  Known limitation: native HTML5 DnD has no touch support, so this is desktop-only;
  worth revisiting with a pointer-events-based library if drag-to-reassign needs to
  work on tablets.

- **The Tru Performance logo's background was removed with a flood-fill from the
  crop's edges, not a flat color-key.** The source asset was the full lockup (icon +
  wordmark) flattened onto a solid black rectangle — placing it as-is in the (mostly
  light) sidebar header would've shown an obvious black box. A naive "make near-black
  pixels transparent" pass doesn't work either: the hexagon icon's *interior* is also
  dark, so it would hollow out along with the real background. Flood-filling from the
  crop's border pixels inward (BFS, Pillow + pure Python, no numpy available in the
  venv) only marks pixels *connected to the edge* as background, leaving the enclosed
  dark interior of the icon untouched. The wordmark itself was dropped in favor of
  real HTML text ("Tru Performance" / "CV Analyzer") next to the icon — crisp at any
  size and theme-aware, where a flattened raster wordmark wouldn't be.

- **`INTERVIEW`/`SELECTED`/`HIRED` joined `MANUAL_OVERRIDE_STATUSES` instead of
  getting a separate "advance pipeline" mechanism.** The `ApplicationStatus` enum
  always had these three values, but nothing in the app could ever set them — the
  AI/ATS pipeline only ever decides `SHORTLISTED`/`REVIEW`/`REJECTED`, so once
  someone was shortlisted, the data model had a "next step" with no way to reach it.
  Rather than build a separate later-stage-progression endpoint, they were added to
  the *same* override set and the *same* `_apply_status_override()` helper —
  recruiter-driven progression and recruiter-driven decision-reversal are really the
  same action (a human manually setting the outcome), just at different points in the
  funnel. Each of the three got its own `email_templates.py` builder rather than
  falling through to `_generic()`, consistent with "never expose a raw status enum to
  the candidate" (§7, the original email-template decision). The frontend splits them
  into two visually distinct button groups ("decision" vs. "hiring progress") purely
  for clarity — the backend doesn't distinguish between them at all, any of the six
  is reachable from any current status, with no enforced sequence.

- **Notes are embedded in `ApplicationOut` rather than fetched separately.** Same
  reasoning as `failure_reason` (§7): a recruiter's commentary is a running record —
  multiple people working the same candidate over time should see everything that
  was said, not just whatever's currently in a single field. Embedding
  `notes: list[NoteOut]` directly in the existing application response (instead of a
  dedicated `GET /applications/{id}/notes`) means the drawer's existing
  `getApplication()` call already has them; every notes endpoint
  (`POST`/`PATCH`/`DELETE /applications/{id}/notes[/{note_id}]`) returns the *whole*
  updated application so the frontend can replace its local state wholesale rather
  than reconciling a separate notes list.

- **Notes started append-only (no edit/delete), then gained both — a deliberate
  reversal, not a contradiction.** The original append-only design intentionally
  mirrored `failure_reason`'s "never lose history" philosophy. Once actually used,
  the real need was for *correcting a typo* or *removing a note added to the wrong
  candidate*, not preserving every draft forever — so `PATCH`/`DELETE
  /applications/{id}/notes/{note_id}` were added, plus a nullable `Note.updated_at`
  (set on edit, `null` until then) so an edited note still visibly says "(edited)"
  rather than silently looking like it was always that text. This required a manual
  `ALTER TABLE notes ADD COLUMN updated_at` against the live Supabase database
  (§7, Supabase migration) — `Base.metadata.create_all()` only creates missing
  *tables*, not missing *columns* on tables that already exist.

- **Sorting candidates by score is a shared client-side utility
  (`lib/sort.ts`), not a backend query parameter.** Both `ApplicationsTable` and
  `CandidatesReportView` already fetch their full application list up front (no
  server-side pagination on the data itself, just on what's *displayed*), so sorting
  in-memory avoids a round trip and keeps the two views' sort behavior identical by
  construction — one function, not two implementations that could drift. Candidates
  with no score yet (`null`) sort to the bottom regardless of direction, so "highest
  AI score first" doesn't bury real scores under a wall of unscored candidates at
  the top.

- **`ClerkName` is a render-prop component, not a custom hook, specifically because
  of the rules of hooks.** `Greeting` and `DashboardHeader`'s breadcrumb both need the
  signed-in user's first name, but `useUser()` can only be called when a
  `ClerkProvider` is actually mounted (dev-bypass mode has none — see §9). The fix
  isn't `if (isClerkConfigured) useUser()` inside a shared hook — conditionally
  calling a hook is invalid regardless of how "stable" the condition looks, ESLint's
  rules-of-hooks check can't (and shouldn't) special-case it. Instead `ClerkName`
  renders one of *two entirely separate components* — one that calls `useUser()`,
  one that doesn't — exactly the same split already used for `ClerkApiBridge`
  (`isClerkConfigured && <ClerkApiBridge />`). Both `Greeting` and the breadcrumb
  consume it via a `render` prop instead of duplicating the split themselves.

- **The greeting is split across two components instead of being one block.** The
  header (`DashboardHeader`'s breadcrumb, when `showingReport` is true) shows the full
  "Good Evening, {name} 👋" — that's the thing that should always be visible, sidebar
  collapsed or not, scrolled down or not. `Greeting.tsx`, rendered once at the top of
  the "All clients" view, originally duplicated that same heading and was visibly
  showing it twice on screen — caught from a real screenshot during review. Fixed by
  leaving the greeting itself solely in the header and reducing `Greeting.tsx` to just
  the one-line tagline underneath it, so the two read as a single message instead of
  a duplicated one. It's gated to `showingReport` only — per-job views keep the
  existing client/job breadcrumb instead, since "good evening" has nothing useful to
  say about *which job* you're looking at.

- **The dashboard's current view (selected job, selected client, and whether you're
  on the "All clients" report) is persisted to `localStorage` from `Dashboard.tsx`,
  the same pattern already used for sidebar-collapse and theme.** Before this, all
  three lived in plain `useState` with no persistence, so a page refresh always reset
  them to their initial values — `ClientJobNav`'s mount-time auto-select-first-job
  fallback would then pick whichever job happens to sort first (`created_at desc`),
  landing on a seemingly arbitrary client every time, regardless of what was actually
  being looked at. `ClientJobNav` now checks whether a restored job id still exists in
  the freshly-fetched job list before trusting it (and falls back to the same
  auto-select-first behavior if not) — necessary because a persisted id could refer to
  a job deleted in a previous session, which the original no-persistence code never
  had to handle.

- **Migrated to Supabase Postgres using the pooler connection string, not the direct
  one — the direct hostname doesn't actually work from most networks.** This wasn't a
  config choice, it was forced by a real failure: `db.<project-ref>.supabase.co`
  (Supabase's "Direct connection" host) resolves via DNS, but only to an IPv6
  (`AAAA`) address — confirmed with `nslookup`, no `A` record at all — so it fails
  with `getaddrinfo failed` / "failed to resolve host" on any network without IPv6
  connectivity, which is most home/ISP networks. The fix is the **pooler** hostname
  (`aws-<n>-<region>.pooler.supabase.com`), which does have IPv4 support; the
  username also changes shape (`postgres.<project-ref>`, not just `postgres`) on the
  pooler. Specifically the **session pooler** (port `5432`), not the **transaction
  pooler** (port `6543`) — found the hard way: transaction-mode pooling was used
  first, and it intermittently 500'd `GET /applications` with
  `psycopg.errors.InFailedSqlTransaction: current transaction is aborted` on requests
  that touched completely unrelated rows. Transaction-mode pgbouncer doesn't dedicate
  one stable backend Postgres connection to the app's logical connection for its
  whole duration, which breaks SQLAlchemy's assumption that a session's
  transaction/rollback state stays scoped to one backend session — once anything
  failed once, an aborted-transaction state could surface on a later, unrelated
  request reusing the same pooled slot. Session-mode pooling (same hostname, just
  port `5432`) keeps one stable backend connection per session and doesn't have this
  problem; confirmed with 20+ repeated calls to the same endpoint (all 200) plus a
  real browser load of the "All clients" view after switching. Required one new
  dependency, `psycopg[binary]` (psycopg3 — SQLAlchemy 2.0's
  `postgresql+psycopg://` dialect), since the project had no Postgres driver
  installed at all before this. The database password needed URL-encoding
  (`urllib.parse.quote(password, safe="")`) before it could go in the connection
  string — it contained `?`, `!`, and `,`, all of which break URI parsing unescaped.
  No model or migration changes were needed beyond that: `db/session.py`'s
  `_is_sqlite` branch already skipped all the SQLite-only `NullPool`/`PRAGMA` logic
  for any non-SQLite URL, and `Base.metadata.create_all()` created all five tables
  (plus the native Postgres enum types SQLAlchemy generates for `Enum` columns on
  Postgres specifically, which SQLite doesn't have an equivalent of) on the first run
  against the new database, verified with a real client/job created via the API and
  confirmed present with a direct `psycopg` query against Supabase, not just through
  the app.

- **Every endpoint that serializes a full `Application` eager-loads `candidate`,
  `job`, and `notes` together (`_APPLICATION_LOAD_OPTIONS` in `applications.py`).**
  Found via a real, measured performance problem after the Supabase migration: the
  cross-job "all clients" view took 2.6s to load 12 applications, because `notes`
  wasn't eager-loaded — one query for the applications, then one *more* query per
  application to lazy-load its notes (an N+1 query pattern that's nearly free on
  local SQLite but multiplies real network round trips on a remote database). Added
  `selectinload(Application.notes)` alongside the existing `joinedload` for
  `candidate`/`job`, applied consistently across every endpoint touching a full
  application response (list, detail, add/edit/delete note, single and bulk status
  override, resend-email) — not just the one that was slow, since they all have the
  same shape of problem waiting to happen on a remote database. Cut the same request
  from 2.6s to 0.68s, confirmed by direct timing before and after.

- **Dashboard stats support three distinct scopes — all clients, one client, or one
  job — and the frontend has to actively choose which, not just pass through
  whatever's currently selected.** `GET /dashboard/stats` takes an optional
  `job_id` *or* `client_id` (job takes precedence if both are somehow present).
  The real bug this fixed: `DashboardStatsBar` always received `selectedClientId`
  regardless of whether the user was looking at a specific client/job or the "all
  clients" report view, so switching to "all clients" left the stat cards showing
  whatever client was selected *before* switching, while the table below correctly
  showed everyone — a visible mismatch between the cards and the data underneath
  them. Fixed by having `Dashboard.tsx` pass `null` for both `clientId` and `jobId`
  whenever the all-clients report view is active. Selecting a client header
  (not a specific job under it) now also explicitly clears job selection
  (`ClientJobNav.tsx`'s `handleSelectGroup` calls `onSelectJob(null)`) — without
  that, clicking a *different* client while a job was still selected from a
  *previous* client would leave the stats pinned to that stale job. Verified all
  three scopes for real (a specific job: 1/1; its client: 4/4; all clients: 6/6) —
  numbers that would silently coincide for a client with only one job, so the
  verification specifically used a client with multiple jobs to actually
  distinguish job-scope from client-scope.

- **`api.ts` only sets `Content-Type: application/json` when the request actually
  has a JSON body, not unconditionally.** It previously set that header even on
  bodyless `GET` requests, which forces the browser to treat the request as
  non-"simple" under CORS and send a preflight `OPTIONS` request first — doubling
  the round trips for every read. Harmless functionally (the preflights were
  succeeding), but a real, avoidable cost stacked on top of the Supabase
  network-latency work above.

- **The marketing landing page's image/icon assets (`frontend/public/lp/`) were
  silently truncated stubs, not the real files — found by comparing against the
  `main` branch, not by anything erroring.** 33 of 34 asset files were a few hundred
  bytes each (most SVGs exactly 225/261/267 bytes regardless of what they were
  supposed to contain) instead of their real size, so things like the hero's demo
  video thumbnail and the footer's wordmark logo rendered as blank boxes — no
  failed network request, no console error, just empty content, easy to miss in a
  routine check. Restored by extracting the real blobs from `origin/main` (a
  separate, frontend-only repo layout with no `backend/` — files live at the repo
  root there, not under `frontend/`) and verifying byte-for-byte via `git
  hash-object`, not just matching file size, since two different files could
  coincidentally match on size alone.

- **`isClerkConfigured` checked for the literal substring `"clerk"` inside the raw
  publishable key string — wrong, and it silently broke a real, valid key.** A
  Clerk publishable key's payload (everything after `pk_test_`/`pk_live_`) is
  base64 of `<frontend-api-domain>$`; decoding confirmed the key in use really did
  belong to the matching `CLERK_ISSUER` (`amusing-ibex-70.clerk.accounts.dev`,
  later rotated to `absolute-alpaca-83.clerk.accounts.dev`), but the raw
  *undecoded* string didn't happen to contain the text "clerk" verbatim — so the
  check failed for a perfectly valid key, silently falling back to dev-bypass
  instead of erroring loudly. Fixed to just check the real key format
  (`pk_test_`/`pk_live_` prefix). Activating real auth also required separately
  setting `CLERK_DEV_BYPASS=false` on the backend (added alongside this fix) —
  a real Clerk key being present doesn't by itself disable dev-bypass.

- **Two landing-page CSS bugs traced to the same root cause: classes referenced in
  JSX that were never actually defined anywhere in this branch's CSS.** Same
  pattern as the truncated-assets bug (§7 above) — silent, no error, easy to
  miss. `.gradient-text` (used for the orange→purple heading accents) and
  `font-inter`/`font-outfit` (used throughout `lp/` components for body and
  heading text) were never ported over when the landing-page components were
  brought into this branch; only `main`'s CSS had the real definitions. Without
  them, headings fell back to the *dashboard's* global fonts (Space Grotesk /
  Plus Jakarta Sans) and the gradient text rendered as plain inherited color.
  Found by decoding `origin/main:src/index.css` directly rather than guessing,
  and fixed by porting the real rules into `landing.css` (scoped to the landing
  page, not the dashboard) plus setting `font-inter` on the landing page's root
  element so untagged body text inherits it too.

- **A third, subtler bug in the same family: `* { border-color: var(--border); }`
  in `index.css` is bare global CSS, not inside a Tailwind `@layer` — so it beat
  every `border-white`/`border-[#hex]` override in the landing page's footer
  regardless of specificity.** Per the CSS Cascade Layers spec, an unlayered rule
  always wins over a layered one no matter how specific the layered rule is;
  Tailwind's own generated utilities (`@import "tailwindcss"`) live inside
  `@layer utilities`, so the bare `*` rule silently overrode every explicit
  border-color utility in the footer, rendering all of its intended white
  dividers as the dashboard's near-black `--border` token instead. Confirmed by
  inspecting `document.styleSheets` directly for which rule actually matched
  (only the bare `*` rule did — Tailwind never even got a chance to compete).
  Fixed by moving the rule into `@layer base`, where it now competes on equal
  footing with Tailwind's own base/utility layers and loses correctly to any
  more specific color utility, while remaining the default for every dashboard
  element that doesn't explicitly override border-color (so this fix is
  invisible there — confirmed nothing in the dashboard relies on losing to `*`).

- **AI matching now tries OpenAI (gpt-4o-mini) first, then automatically falls
  back to Gemini if OpenAI fails for any reason — quota, rate limit, bad key,
  outage.** Previously `AI_PROVIDER` picked exactly one provider with no
  fallback; a single provider's outage took down AI matching/parsing entirely.
  `llm_client.py`'s `call_structured_with_retry` now tries the configured primary
  provider (with its existing exponential-backoff retry on transient errors —
  rate limit, timeout, server overload), and if it's still unavailable after
  those retries, or fails outright with a non-transient error, falls back to the
  other provider (with its own retry) before giving up — re-raising the
  *primary's* error if both fail, since that's the one the operator actually
  configured and needs to see. Falling back only happens if the fallback
  provider's API key is actually configured, so a missing key doesn't change
  the error message that surfaces. Verified for real with a deliberately broken
  `OPENAI_API_KEY` — the call still succeeded by transparently falling back to
  Gemini — and confirmed the normal (no failure) path still uses OpenAI directly.

---

## 8. Environment variables

See `backend/.env.example` and `frontend/.env.example` for the canonical list with
inline comments. Summary:

| Var | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | SQLite by default; Supabase Postgres session-pooler connection string in this environment right now (§7) — must use the `*.pooler.supabase.com` host on port `5432` (session pooler), not `db.<ref>.supabase.co` (direct, doesn't resolve) or port `6543` (transaction pooler, breaks transaction handling) |
| `BLOB_READ_WRITE_TOKEN` | backend | Vercel Blob — CV file storage |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | backend | candidate email notifications |
| `COMPANY_NAME` | backend | sign-off line in candidate emails (`email_templates.py`); defaults to "the hiring team" |
| `CLERK_SECRET_KEY`, `CLERK_ISSUER` | backend | JWT verification (JWKS fetched from `{issuer}/.well-known/jwks.json`). Real auth is active in this environment — see §9 |
| `CLERK_DEV_BYPASS` | backend | forces the dev-bypass auth path even when real Clerk keys are configured; `false` in this environment (§7, §9) |
| `VITE_CLERK_PUBLISHABLE_KEY` | frontend | sign-in UI; must start with `pk_test_`/`pk_live_` for `isClerkConfigured` to recognize it (§7) |
| `TESSERACT_CMD` | backend | path to the Tesseract binary |
| `AI_PROVIDER` | backend | primary provider, `openai` or `gemini` — the other becomes the automatic fallback (§5, §7) |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | backend | whichever `AI_PROVIDER` points to |
| `AUTO_REJECT_ENABLED` | backend | gate item #3 from the original design doc — still unanswered, defaults to safe (`false`) |
| `CORS_ALLOW_ORIGINS` | backend | must include the frontend's real origin |
| `VITE_API_BASE_URL` | frontend | backend URL |

---

## 9. Frontend auth flow

Clerk is **active** in this environment — real sign-in is required, not bypassed.
`isClerkConfigured` (`lib/auth.ts`) just checks the publishable key actually looks
like one (`pk_test_...` / `pk_live_...`); an earlier version of this check also
required the raw key string to literally contain the substring `"clerk"`, which is
wrong — a valid key's base64-encoded payload doesn't necessarily preserve that text,
and it silently broke auth for an otherwise-valid key (§7).

```
main.tsx:  reads VITE_CLERK_PUBLISHABLE_KEY
           ├─ if it's a real pk_test_/pk_live_ key → mounts <ClerkProvider>
           └─ if missing/placeholder → renders <App> directly, no Clerk at all
              (the dev-bypass path — not in use right now, but still works for
              anyone running this without their own Clerk keys configured)

App.tsx:   /dashboard wrapped in <SignedIn>/<SignedOut> ONLY when isClerkConfigured
           (ClerkApiBridge mounted the same way — calling Clerk hooks without a
           provider throws, so both are conditional on the same check). Also has
           its own /sign-in and /sign-up routes rendering Clerk's <SignIn>/<SignUp>
           components directly, rather than relying solely on Clerk's hosted pages.

ClerkApiBridge.tsx:  bridges useAuth().getToken() into lib/api.ts's module-level
                     authTokenGetter, so every api.* call automatically attaches
                     a fresh Authorization header — without every component needing
                     to know about Clerk directly

ClerkName.tsx:       same conditional-mount split as ClerkApiBridge, but as a
                     render-prop component rather than a side-effect-only one —
                     for components that need the signed-in user's first name
                     (Greeting, DashboardHeader's breadcrumb) rather than just
                     a token (see §7 for why this can't be a plain custom hook)

backend/clerk_auth.py:  require_auth() dependency on every /jobs, /applications,
                        /clients, /dashboard route. Verifies the JWT against Clerk's JWKS,
                        checks issuer + azp (if present) against CORS_ALLOW_ORIGINS.
                        leeway=10s on exp/iat to tolerate clock drift between
                        this machine and Clerk's servers (a real issue we hit).
                        Skipped when CLERK_ISSUER is unset OR when CLERK_DEV_BYPASS=true
                        is explicitly set — the latter exists so dev-bypass can be
                        forced even with real Clerk keys already filled in.
```

---

## 10. Design system (current: "Orange & Black")

Tokens live in `frontend/src/index.css` as CSS variables (`:root` / `.dark`), surfaced
to Tailwind v4 via `@theme inline` — **there is no `tailwind.config.js`**, Tailwind v4
doesn't use one. Dark mode toggles via a `.dark` class on `<html>`, set by
`ThemeContext.tsx` and persisted to `localStorage`.

- **Fonts:** Space Grotesk (`--font-display` — headings, stat numbers, dialog titles) +
  Plus Jakarta Sans (`--font-body` — everything else).
- **Brand accent is locked to Tru Performance orange, scoped deliberately, not
  applied indiscriminately (§7):** `--primary`/`--ring` are the brand orange
  (`#ff5a24` in dark mode), used only for primary CTA buttons, the selected/active
  state (selected client, selected job, active nav item), and nowhere else — it does
  not appear in decorative chrome (ambient background blobs are neutral gray, not
  tinted) so it never competes with itself for attention. Light mode uses a deeper
  shade (`#c53d0d`) for the same role, since the brand orange itself only hits
  3.12:1 contrast against white (fails WCAG AA) — verified by computing contrast
  ratios directly against real computed styles in a running browser, not eyeballed.
  Button text picks whichever of near-black/white passes 4.5:1 against that mode's
  `--primary` (near-black in dark mode, white in light mode — they differ because
  the two modes use different exact shades).
- **Other color families, one meaning each, used everywhere that meaning shows
  up:** Verdant (`--success`, green) for positive/decided outcomes, Ember
  (`--warning`, amber) for active/in-progress, Alarm Red (`--destructive`) reserved
  for failure states and the Failed stat card's escalation, and **Dusk Violet**
  (`--dead-end`, added for the badge-family redesign, §7) for terminal-but-not-an-
  outcome states (`DUPLICATE`/`CLOSED`/`ARCHIVED`). These are deliberately kept out
  of the orange's way — a status badge never uses the same hue as "this is
  selected" / "this is the primary action." Dusk Violet verified at 6.89:1 light /
  7.57:1 dark.
- **Status badges (`StatusBadge.tsx`):** filled pill = a *decided* state (one of the
  color families above); dashed-outline pill = `PENDING`/`UPLOADED`/`PARSED`/
  `SCREENED`/`DRAFT` specifically — "hasn't happened yet" is a different shape, not
  just a paler fill. A small leading dot repeats the family color for colorblind
  users; `StatusDot` exports just that dot for tight spaces (sidebar job rows).
- **Radius has two registers, used with intent, not one value everywhere:** stat
  cards and dialogs get the *larger*, softer `rounded-xl` (`--radius-xl`, 18px —
  added specifically so "glass/soft" surfaces would read as deliberately rounder);
  the applications table gets the *smaller*, structural `rounded-md` (8px) with a
  solid `bg-card` and a real border, not `.glass` — dense tabular data reads as a
  grid, not another floating panel. Job/client pills and badges stay `rounded-full`
  (the universal "this is state" shape).
- **`.glass` utility:** `backdrop-filter: blur(16px) saturate(140%)` + semi-transparent
  background + 1px border + shadow — applied selectively (stat cards, modals, header,
  sidebar), not globally. The data table stays solid for readability (see radius note
  above).
- **`.ambient-background`:** fixed-position blurred shapes behind everything, so the
  glass surfaces have something real to refract instead of just looking like flat
  gray fog — kept neutral gray (not brand-orange-tinted) specifically so the orange
  accent's "this is selected / this is the primary action" meaning never gets diluted
  by also showing up as ambient decoration (§7).
- **`.alarm-card` / `alarm-pulse`:** the signature visual element — a `box-shadow`
  pulse (via `color-mix()`, not a separate RGB-triple token) applied exclusively to
  the Failed stat card, exclusively when `failed > 0` (§7). `prefers-reduced-motion`-
  safe. (The stat bar's one-time page-load sweep animation, `.scan-sweep`, was
  removed during the orange/black pass — once `--primary` became orange, the sweep
  read as a stray glow across the cards rather than a subtle reveal.)
- **Layout:** persistent collapsible sidebar (`ClientJobNav` inside `PageLayout`) +
  main column, `flex-col` below the `lg` breakpoint (sidebar stacks above content,
  no independent-scroll rail on narrow screens) and `flex-row` at `lg:` and up. Sidebar
  width and collapsed state are plain Tailwind classes (`lg:w-72` / `lg:w-16`), not
  new CSS tokens — no need for theme-level control over a single component's width.
- **Branding:** Tru Performance icon (`/tru-performance-icon.png`, transparent
  background — extraction method in §7) + real text, not a flattened logo image, in
  the sidebar header. Collapses to just the icon when the sidebar is collapsed.

**The marketing landing page (`pages/Landing.tsx` + `components/lp/*`) has its own,
separate design system — it does not share the dashboard's "Orange & Black" tokens
above.** Font is Inter (`font-inter`, set as the page root's default — §7), accent is
an orange→purple gradient (`#FF5A24` → `#8050FF`, via `.gradient-text` for headings
and `.gradient-cta` for buttons), both defined in `landing.css`, not `index.css`. The
reference design lives at a separate deployment (`hr-cv.tp-devserver.com`) and a
sibling git branch (`main` — §12); when in doubt about how something on the landing
page should look or behave, that reference is the source of truth, not this section.
`.gradient-cta` buttons render as an outline (gradient border + gradient text) by
default and switch to a solid gradient fill with white text on hover — the same
scheme on every pricing-card CTA, not a different treatment per plan (§7).

---

## 11. What's explicitly out of scope (still)

Carried over from the original design doc and never revisited:
- RBAC / role-based permissions
- Candidate self-apply portal (recruiters upload CVs on candidates' behalf)
- Custom hiring workflow stages / interview scheduling
- Screening questions
- Multi-tenant support — the `clients` table (§3, §7) is just a grouping label on jobs
  for recruiters hiring across multiple companies; it has no access control or data
  isolation, so it doesn't satisfy this item

See the original design plan doc (`cv-analyzer-design-plan (1).md`, outside this project
folder, in `Downloads/`) for the full reasoning behind these exclusions (team size,
timeline).

---

## 12. Where this lives in git

Repo: `https://github.com/dev-truperformance/HR-CV-Parser`, branch **`cv-analyzer-rebuild`**.

Worth knowing before touching branches: that repo's `main`/`staging`/`dev-shweta`/`abhay`
branches already contain a *separate, unrelated* project — a marketing landing page
(Banner, pricing, footer, etc.), built as a single frontend app at the repo root. This
CV Analyzer rebuild has a completely different, unrelated git history and a `backend/` +
`frontend/` structure that doesn't match that layout. The two haven't been reconciled —
whether they become one combined product, two separate repos, or something else is a
structural decision that hasn't been made yet. Don't force-push or rebase `abhay`/`main`
without checking what's actually on them first.

---

## 13. Testing & verification approach

No single test suite covers this project end to end — verification is a mix of a
small backend unit-test suite plus deliberately *not* trusting anything that wasn't
checked against a real running instance.

- **Backend unit tests** (`backend/tests/`, pytest): currently one file,
  `test_application_schema.py`, covering a real bug in `ApplicationOut`'s Pydantic
  validation (a dummy application object missing `notes`/`job_title` attributes
  entirely). Run with `python -m pytest tests/` from `backend/` (`.venv` active).
  Small suite, not a substitute for the manual verification below — it covers schema
  edge cases, not behavior.
- **Real API calls against the dev-bypass backend**, not assumed-correct code
  review: every endpoint change in this project has been exercised with actual
  `curl` requests against a locally running backend (`CLERK_ISSUER=` unset enables
  the dev-bypass auth path, §9), reading the *actual* JSON response and HTTP status,
  not just the code that produces it. For destructive or stateful operations
  (deletes, status overrides, bulk actions), this includes reverting test data back
  to its original state afterward rather than leaving disposable test rows in a
  shared dev database.
- **Direct database verification, independent of the API layer**: for anything
  where "the API says it worked" isn't enough to trust (the Supabase migration, the
  asset-truncation bug, the N+1 query fix), verification went one level deeper —
  direct `psycopg` queries against Postgres to confirm rows actually exist with the
  right values, `git hash-object` to confirm a restored file is byte-identical
  rather than just the right size, repeated timed `curl` calls to confirm a
  performance fix is real and not a one-off fast response.
- **Frontend type-checking and build, every change**: `npx tsc -b --noEmit` and
  `npm run build` (which also runs `tsc -b`) before considering any frontend change
  done — catches the category of bug where something looks right in a diff but
  doesn't actually compile (mismatched prop types, a renamed function not updated at
  every call site).
- **Real browser automation (Playwright) for anything visual or interactive**, not
  just "the code looks like it should work": a throwaway Playwright script per
  feature, run against the actual dev server, that navigates, clicks, and reads real
  rendered text/screenshots rather than trusting the component code alone. Used to
  catch things static analysis can't: a console error, a network request that 404s,
  a CORS preflight, an animation that looks wrong, two numbers on screen that
  contradict each other (the dashboard-stats scoping bug was *found* exactly this
  way — by screenshotting the actual rendered cards, not by reading the component
  code and assuming it was right). Screenshots are actually opened and looked at,
  not just generated — a blank or broken-looking screenshot is itself a finding.
- **Contrast/accessibility checks computed, not eyeballed**: WCAG contrast ratios
  verified by extracting real computed `color`/`background-color` from a live page
  via Playwright and running them through the actual relative-luminance/contrast
  formula, in both light and dark mode — including the orange-on-white case that
  the design brief specifically flagged as the most likely place contrast would
  break, which it did (3.12:1, fixed with a deeper shade for light mode, §7).
- **Performance claims are measured before and after, not assumed**: e.g. the N+1
  query fix and the Supabase pooler-mode fix are both reported with actual `curl
  -w "%{time_total}"` timings from before and after the change, not "this should be
  faster."
