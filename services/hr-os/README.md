# HR OS service

The CV Analyzer ATS, running as the backend for **HR OS** in the HiveX platform.

An AI applicant tracking system: a recruiter creates a job and pastes the job
description, AI extracts the required skills and experience, recruiters upload
CVs, and each one is read (OCR included, so scanned PDFs work), scored against
the job's requirements, and sorted into Shortlisted / Review / Rejected with an
explanation for every score.

This service is unchanged from the standalone project apart from one thing: the
platform origin `http://localhost:3005` was added to the CORS defaults.

---

## Running it

```bash
python -m venv .venv
```

```bash
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Health check: <http://127.0.0.1:8000/health> · API docs: <http://127.0.0.1:8000/docs>

It starts without an `.env`: the SQLite dev database (`cv_analyzer.db`) is used
and auth is skipped, because `require_auth` dev-bypasses when `CLERK_ISSUER` is
unset. AI and email features need keys — see below.

**OCR needs Tesseract installed separately:**

```bash
winget install --id UB-Mannheim.TesseractOCR -e
```

---

## Configuration

```bash
cp .env.example .env
```

| Variable | Needed for |
| --- | --- |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | JD extraction and CV matching. OpenAI is primary, Gemini is the automatic fallback. |
| `BLOB_READ_WRITE_TOKEN` | Storing uploaded CV files (Vercel Blob). Failure here is non-fatal — OCR still runs. |
| `RESEND_API_KEY` | Candidate status emails. |
| `CLERK_SECRET_KEY`, `CLERK_ISSUER` | Real auth. Leave unset for the dev-bypass. |
| `DATABASE_URL` | Defaults to local SQLite; point at Supabase Postgres for a shared database. |
| `CORS_ALLOW_ORIGINS` | **Must include `http://localhost:3005`** — it doubles as the allow-list for a Clerk token's `azp` claim. |
| `TESSERACT_CMD` | Path to the Tesseract binary. |

---

## Schema note

`Base.metadata.create_all()` creates missing *tables* but never missing
*columns*, so a database created before a model gained a column will fail at
query time rather than at startup.

The bundled `cv_analyzer.db` hit exactly that: `notes.updated_at` existed on the
model but not in the file, and every endpoint that loads notes returned a 500.
It has been patched in place with:

```sql
ALTER TABLE notes ADD COLUMN updated_at DATETIME;
```

If you point `DATABASE_URL` at another pre-existing database, expect to do the
same. A real migration tool (Alembic) is the proper fix and is not set up here.

---

## Endpoints

| Group | Routes |
| --- | --- |
| Clients | `GET/POST /clients`, `PATCH/DELETE /clients/{id}` |
| Jobs | `GET/POST /jobs`, `GET/PATCH/DELETE /jobs/{id}`, `POST /jobs/extract-jd`, `POST /jobs/{id}/extract` |
| Applications | `POST /jobs/{id}/applications/upload`, `GET /jobs/{id}/applications`, `GET /applications`, `GET/DELETE /applications/{id}`, `PATCH /applications/{id}/status`, `PATCH /applications/bulk-status`, `POST /applications/bulk-delete`, `POST /applications/{id}/retry`, `POST /applications/{id}/resend-email`, `GET /applications/{id}/resume`, notes CRUD |
| Dashboard | `GET /dashboard/stats?client_id=&job_id=` |

The platform's typed client for these lives in
[`hivex/src/os/hr/api/client.ts`](../../hivex/src/os/hr/api/client.ts).
