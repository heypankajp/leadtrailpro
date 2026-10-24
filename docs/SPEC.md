# SalesTrackPro — Technical Specification (SPEC)

| | |
|---|---|
| Source | `Sales_Tracker_App_BRD_SRS.docx` v1.0 (October 13, 2026) and its updated PDF of October 19, 2026 (adds BRD §25, PRD §3.23), the change note `SalesTrackPro_Sales_Trip_Planner_Requirement_Change.docx` (October 21, 2026, local and untracked), and the current codebase |
| SPEC version | 1.6 — October 23, 2026: legacy tracker import as built (§10.9). 1.5 — October 22, 2026 (1.4: October 22, 2026; 1.3 and 1.2: October 21, 2026; 1.1: October 18, 2026; 1.0: October 17, 2026) |
| Changes in 1.4 | In-app notifications, preferences, digests, and the jobs scheduler (TASK-06, NTF-*: migration 7, §3.17–3.18, §6.10, §7.11, `scripts/jobs.mjs`, compose `jobs` service). Opportunity Recommendation design sketch (§10.10) for the updated BRD's §25. Mail provider switch with a stub outbox (`MAIL_PROVIDER`, migration 6, §3.16, §6.2). Needs-attention rules per status / BD action (TASK-05: `reminders.rules`, §3.12, §7.9), report stage and template filters (RPT-05, §6.6), PDF exports with `pdfkit` (RPT-06, `src/lib/pdf.ts`, §6.6, §6.9), axe-core accessibility audit in the browser suite (NFR-07, §12) |
| Changes in 1.3 | Sales Trip Planner built (TRIP-01..11: migration 5, provider interface with stub and Google adapters, lead matching, trips API §6.9, screen A16, Excel export) and report Excel export (RPT-06). Lead status reasons implemented (LEAD-06/07: migration 4, `status_reason_id`, reason lists, status prompt, filters). PostgreSQL replaces MySQL: `pg` driver and `?`→`$n` query layer (§1, §2), PG* settings and `postgres:17` containers (§2), identity columns, JSONB, TIMESTAMP(0) UTC and the updated_at trigger (§3), SQLSTATE error mapping (§6) |
| Changes in 1.2 | Sales Trip Planner design and screen A16 (§2.1, §8, §9, §10.8), lead status reasons (§3.5, §3.6, §3.13, §6.4, §7.1), legacy tracker import (§10.9) — from the change note of October 21, 2026 (PRD §3.22, LEAD-06/07) |
| Changes in 1.1 | Docker packaging (§2.3), Selenium end-to-end suite (§12), Secure-cookie rule for plain-http deployments (§4, §11), `mysql2` kept external in the standalone build (§1) |
| Companion | `PRD.md` — requirement IDs referenced here (AUTH-01, LEAD-01, …) |
| Scope | As-built design of Phase 1, the BRD screen designs (Appendix A), and the intended design of Phase 2/3 features |

---

## 1. Architecture

```
Browser (React 19 client, single page, hash-routed views)
   │  same-origin JSON + multipart over HTTPS, httpOnly session cookie
   ▼
Next.js 16 (App Router) — route handlers under src/app/api/**            Node.js runtime
   ├─ src/lib            db pool, dates/timezone, http helpers, mailer, async-data hook
   ├─ src/features/<area> model (types + validation) · repository (SQL + rules) · client (fetch) · UI
   ├─ scripts/           schema migrations, app DB user, sample data, Docker entrypoint, e2e runner
   └─ tests/e2e/         Selenium browser suite (node:test)
   │
   ├─ PostgreSQL 14+  (restricted app role: SELECT/INSERT/UPDATE/DELETE only)
   ├─ Local file storage for attachments (ATTACHMENT_DIR)
   └─ SMTP (nodemailer) for reset links and two-factor codes, or the stub outbox (MAIL_PROVIDER=stub)
```

**Conventions**

- Feature folders: `model.ts` (shared types, validation, pure helpers; importable by the client), `repository.ts` (server-only SQL and business rules), `client.ts` (browser fetch wrappers), React components.
- All route handlers: validate origin for state changes → load the session user → check privilege → parse body → call repository → map errors with `handleRouteError` (which rethrows Next.js internal signals first).
- Every mutation runs in one transaction with its audit entry and timeline entry.
- All instants are stored in UTC as `TIMESTAMP(0)` text (`src/lib/db.ts` converts to and from ISO 8601); calendar fields are `DATE`; the business timezone (default `America/Toronto`) is applied only when turning instants into business days.
- JSONB columns hold lists (client emails, privileges, checklist) and audit snapshots.
- Repositories write SQL with `?` placeholders; `src/lib/db.ts` rewrites them to `$1 … $n`, returns `{ rows, rowCount }`, and inserts use `RETURNING id`. camelCase column aliases are double-quoted because PostgreSQL folds unquoted identifiers to lower case.

**Stack:** Next.js 16.4 (Turbopack), React 19.3, TypeScript 5, Tailwind v4 (preflight only; styling is hand-written CSS in `src/app/globals.css`), pg, exceljs, pdfkit, nodemailer, lucide-react icons, mammoth (Word preview). Dev dependency for tests: selenium-webdriver 4.51.

**Build output:** `next.config.ts` sets `output: "standalone"` (traced server + `node_modules` under `.next/standalone`) and lists `pg`, `exceljs`, and `pdfkit` in `serverExternalPackages` so they stay plain Node packages; the production image therefore also runs `scripts/*.mjs`. Cache Components and partial prefetching are enabled; the single page `/` prerenders as a static shell and every API route is dynamic.

---

## 2. Configuration and setup

### 2.1 Environment variables (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | yes | Runtime database role (written by `npm run db:user:create`); the database defaults to `salestrackpro` |
| `USER_MANAGEMENT_KEY` | first run | Bootstrap key for the first administrator (AUTH-01) |
| `APP_URL` | behind a proxy | Public origin; used for the same-origin check and reset links. An `http://` value turns off the Secure cookie flag (plain-http deployments, the e2e stack) |
| `TRUSTED_ORIGINS` | optional | Extra allowed origins, comma separated |
| `BUSINESS_TIMEZONE` | optional | IANA zone, default `America/Toronto` (BR-12) |
| `ATTACHMENT_DIR` | optional | Attachment root, default `./storage/attachments` |
| `MAIL_PROVIDER` | optional | `stub` records every message in `mail_outbox` instead of sending (reset links and sign-in codes readable under Settings → Email delivery); `smtp` (default when SMTP_* exists) sends; `off` disables email even with SMTP_* set. The Docker dev stack template and the e2e stack use `stub` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | for real email | Mailer; absent (and no stub) → email features report "not configured" |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `GOOGLE_REDIRECT_URI` | for Gmail | OAuth client for Gmail linking (MAIL-01); the token key encrypts stored refresh tokens; redirect defaults to `APP_URL/api/gmail/callback`. Absent → the Emails tab reports "not configured" |
| `MAPS_API_KEY` | for TRIP-* with live data | Google Geocoding, Places, and Distance Matrix calls (§10.8). Absent (and no stub) → the Sales Trip Planner reports "not configured" |
| `JOBS_API_URL`, `JOBS_API_KEY` | for TRIP-06 with live data | Licensed job-listing aggregator behind the JSON contract in §10.8. Absent → the Hiring column is blank |
| `JOBS_KEY` | for the scheduler | Shared secret that `scripts/jobs.mjs` (or an external cron) sends as `X-Jobs-Key` to `POST /api/jobs/run`; compose passes `${JOBS_KEY:-dev-jobs-key}` to both the app and the `jobs` service |
| `TRIPS_PROVIDER` | development, tests | `stub` serves the in-repo sample companies (the Docker dev stack and the end-to-end suite set it); empty selects the Google adapter |

`.env.setup.local` (administrator credentials as `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`, optional `PGAPPUSER` and `PGDATABASE`) is used only by the setup scripts and never by the app. In Docker the `setup` service passes the same variables as environment and does not need the file. Trip-planner keys (`MAPS_API_KEY`, `JOBS_API_URL`, `JOBS_API_KEY`) are written as blank placeholders.

### 2.2 Scripts

| Command | Script | Behaviour |
|---|---|---|
| `npm run db:create` | `scripts/create-database.mjs` | Connects to the maintenance database `postgres`, creates `salestrackpro` when missing, then applies numbered migrations recorded in `schema_migrations`, each in its own transaction. Migration 1 creates all tables, the `set_updated_at` trigger function, and seeds list values, target templates, and settings. Idempotent. |
| `npm run db:user:create` | `scripts/create-app-user.mjs` | Creates the `salestrackpro_app` role with LOGIN, CONNECT, USAGE on `public`, and SELECT/INSERT/UPDATE/DELETE on all current and future tables plus USAGE on sequences (identity columns), then writes `.env.local` (mode 0600). Re-running rotates the password and bootstrap key and keeps every other line already in the file. |
| `npm run db:seed` | `scripts/seed-sample-data.mjs` | Requires an administrator. Creates demo users (two Sales Managers, one Recruiter, password `SalesTrackPro-demo-2026`), eleven leads across states and statuses (including one Lost Lead – Pricing and one archived Disqualified – Not Interested), activities, tasks. No-op when leads exist. |
| `npm run dev` / `build` / `start` | Next.js | Development server / production build / production server |
| `npm run lint` / `typecheck` | ESLint (next/core-web-vitals + typescript + react-hooks) / `tsc --noEmit` | |
| `npm run jobs` | `scripts/jobs.mjs` | Scheduler: every `JOBS_INTERVAL_SECONDS` (60) it POSTs to `JOBS_URL/api/jobs/run` with `JOBS_KEY`; the app runs whatever digest is due, once per period |
| `npm run test:e2e` | `tests/e2e/*.test.mjs` | Selenium suite via `node --test` (sequential, 120 s per test). Targets `E2E_BASE_URL` (default `http://app-test:3000`) and `E2E_SELENIUM_URL` (default `http://selenium:4444`). |
| `scripts/e2e.sh [files]` | compose profile `test` | Recreates the throwaway test database, builds the production image and the dev image, runs the suite, removes the test containers. Finds the Docker Desktop CLI on macOS when `docker` is not on PATH. |
| `scripts/docker-entrypoint.sh` | dev container | Runs `npm ci` into the `node_modules` volume when `package-lock.json` differs from the installed stamp, then execs the command. |

### 2.3 Containers

`Dockerfile` (base `node:22-bookworm-slim`) has two targets: `dev` (dependencies in the image, project bind-mounted at `/app`, `next dev`) and `runner` (standalone output, `.next/static`, `public/`, `scripts/`, user `node`, `node server.js` on port 3000). `.dockerignore` keeps `node_modules`, `.next`, `storage`, `.env*`, `docs`, and `tests` out of the build context.

| Service (`compose.yaml`) | Image | Role |
|---|---|---|
| `db` | `postgres:17-alpine` | Development database, volume `postgres_data`, published on `127.0.0.1:${DB_PORT:-5433}`, superuser `postgres` with password `${POSTGRES_PASSWORD:-salestrackpro}`; the healthcheck uses `pg_isready -h 127.0.0.1` so it only passes once first-run initialisation is complete |
| `app` | `salestrackpro-dev` (target `dev`) | Dev server on `${APP_PORT:-3000}`; volumes `node_modules` and `next_cache` shadow the host directories |
| `jobs` | `salestrackpro-dev` (prod: `salestrackpro` runner) | Runs `scripts/jobs.mjs` against `http://app:3000` with the shared `JOBS_KEY` |
| `setup` (profile `setup`) | `salestrackpro-dev` | One shot: `create-database.mjs` + `create-app-user.mjs` as `postgres`; writes `.env.local` with `PGHOST=db` into the bind mount |
| `db-test` (profile `test`) | `postgres:17-alpine` | Throwaway database on tmpfs, password `test`, not published |
| `app-test` (profile `test`) | `salestrackpro` (target `runner`) | Applies migrations then serves the production build; `APP_URL=http://app-test:3000`, `USER_MANAGEMENT_KEY=e2e-user-management-key`; healthcheck on `/api/auth/session` |
| `selenium` (profile `test`) | `selenium/standalone-chromium:4` | Chromium grid, 2 GB shm, 1600×1200 screen, noVNC on `127.0.0.1:7900` |
| `e2e` (profile `test`) | `salestrackpro-dev` | Runs `npm run test:e2e` once `app-test` is healthy |

`compose.prod.yaml` overrides `app` with the `runner` target, `env_file: .env.local`, an `attachments` volume at `/app/storage/attachments`, `restart: unless-stopped`, and removes the database port; it requires `POSTGRES_PASSWORD` in `.env`.

---

## 3. Data model

ER summary: `users` own `leads`; `leads` have many `lead_activities`, `tasks`, `lead_attachments`; `list_values` are referenced by seven lead columns; `target_templates` are referenced by `users`; `audit_log` references everything loosely by `(entity_type, entity_id)`.

All tables live in the `public` schema of the `salestrackpro` database. Ids are `GENERATED ALWAYS AS IDENTITY`; instants are `TIMESTAMP(0)` holding UTC; JSON is `JSONB`; every table with `updated_at` has a `BEFORE UPDATE` trigger calling `set_updated_at()`. Comparisons are case-sensitive (unlike MySQL's collation), so emails are lower-cased before storage and lookup, and keyword search applies `LOWER()`.

### 3.1 `users`

| Column | Type | Notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| first_name, last_name | VARCHAR(80) | |
| email | VARCHAR(254) UNIQUE | lower-cased |
| phone | VARCHAR(40) | |
| password_hash | VARCHAR(180) | `scrypt$<salt hex>$<key hex>` (16-byte salt, 64-byte key) |
| role | VARCHAR(40) | `admin` · `sales_manager` · `recruiter` (ROLE-01) |
| privileges | JSONB | **extra** privileges beyond the role defaults (ROLE-03) |
| stage | VARCHAR(30) | `onboarding` · `training` · `full_productive` (TGT-04) |
| is_active | BOOLEAN | false after termination |
| terminated_at | TIMESTAMP(0) NULL | |
| two_factor_enabled, auto_logout_enabled | BOOLEAN | AUTH-06, AUTH-07 |
| auto_logout_time | CHAR(5) DEFAULT '23:00' | AUTH-07: daily sign-out time `HH:MM` in the business timezone (migration 2) |
| target_template_id | INT UNSIGNED NULL FK → target_templates (SET NULL) | explicit assignment; otherwise stage default |
| created_at, updated_at | TIMESTAMP | |

### 3.2 `user_sessions`

id BIGINT PK · user_id FK (CASCADE) · token_hash CHAR(64) UNIQUE (SHA-256 of the cookie token) · expires_at TIMESTAMP(0) (8 h) · created_at. Index on expires_at.

### 3.3 `login_history` (AUTH-09, AUTH-11)

id · user_id NULL · email · succeeded BOOLEAN · ip_address VARCHAR(64) · user_agent VARCHAR(255) · created_at. Indexes on (email, created_at), (ip_address, created_at), (user_id, created_at). Also the rate-limit store.

### 3.4 `email_tokens` (AUTH-05, AUTH-06)

id · user_id FK · purpose `password_reset` | `two_factor` · token_hash CHAR(64) (hash of the link token or the 6-digit code) · challenge_hash CHAR(64) NULL (hash of the 2FA cookie value) · attempts INT · expires_at · consumed_at NULL · created_at.

### 3.5 `list_values` (LOV-*)

id · list_key VARCHAR(40) (`lead_type`, `status`, `bd_action`, `client_response`, `lead_category`, `company_size`, `city`, `lost_reason`, `disqualified_reason` (migration 4), `business_type` (migration 5)) · code VARCHAR(60) (stable slug; `cold/warm/hot/client/lost/disqualified` are relied on by code) · value VARCHAR(120) (display, renamable) · sort_order INT · is_active BOOLEAN · timestamps. Unique (list_key, code) and (list_key, value). The five `disqualified_reason` rows are seeded and cannot be deactivated or added to; `lost_reason` is an ordinary Admin list seeded with "Pricing".

### 3.6 `leads` (LEAD-01)

| Column | Type | BRD field |
|---|---|---|
| id | INT UNSIGNED PK | |
| owner_id | FK users | 2 Owner (OWN-01) |
| created_by | FK users | |
| lead_type_id | FK list_values | 1 |
| status_id | FK list_values | 7 |
| status_reason_id | FK list_values NULL (SET NULL), indexed (migration 4) | 25 (LEAD-06): a `lost_reason` row when the status code is `lost`, a `disqualified_reason` row when it is `disqualified`, NULL otherwise; enforced in the repository |
| bd_action_id, client_response_id, lead_category_id, company_size_id, city_id | FK list_values NULL (SET NULL) | 5, 6, 21, 22, 10 |
| client_name | VARCHAR(200) | 4 |
| company_url | VARCHAR(2048) | LEAD-02 |
| address | VARCHAR(500) | 8 |
| comments | TEXT NULL | 9 |
| client_executive | VARCHAR(160) | 12 |
| contact_phone, contact_alt_phone | VARCHAR(40) | 13, 14 |
| contact_remark | VARCHAR(500) | 15 |
| client_emails | JSONB (string array) | 16 |
| industry | VARCHAR(120) | 17 |
| positions | TEXT NULL | 18 |
| first_contact_date | DATE | 3 |
| follow_up_date | DATE NULL | 11 |
| contract_signed_date | DATE NULL | 19 |
| record_state | VARCHAR(10) CHECK active/queued/archived | QUE-*, SRCH-05 |
| state_reason | VARCHAR(500) NULL | archive reason or "Rejected: …" |
| state_changed_by, state_changed_at | | |
| last_activity_at | TIMESTAMP(0) | NAV-03 sort key; bumped by every timeline entry |
| created_at, updated_at | | |

Indexes: (record_state, last_activity_at), (owner_id, record_state), status_id, follow_up_date, first_contact_date, created_at.

### 3.7 `lead_activities` (NOTE-01, NOTE-06, AC-02)

id BIGINT · lead_id FK (CASCADE) · user_id FK · activity_type VARCHAR(30) · summary VARCHAR(500) · body TEXT NULL (note text) · value_code VARCHAR(60) NULL (e.g. status code `client` for conversions, BD action code) · meta JSONB NULL · occurred_at TIMESTAMP(0) (user-supplied, not in the future) · created_at.

Activity types: `created`, `call`, `email`, `visit`, `note`, `status_change`, `bd_action`, `client_response`, `follow_up`, `transfer`, `state_change`, `task`, `file`, `edit`. The first five are user-logged; the rest are system-generated.

### 3.8 `tasks` (TASK-02)

id BIGINT · lead_id NULL FK (CASCADE) · title VARCHAR(200) · description TEXT · assignee_id FK · creator_id FK · due_at TIMESTAMP(0) NULL · priority low/normal/medium/high · status open/done · checklist JSONB `[{text, done}]` · completed_at · created_at, updated_at. Indexes on (assignee_id, status, due_at), lead_id, (creator_id, created_at).

### 3.9 `lead_attachments` (FILE-*)

id BIGINT · lead_id FK (CASCADE) · uploaded_by FK · category `document` | `profile` · label VARCHAR(120) (JD, Agreement, …, candidate name) · file_name VARCHAR(255) · mime_type · size_bytes · storage_key VARCHAR(255) (relative path under ATTACHMENT_DIR) · version INT · replaces_id NULL (previous version) · deleted_at, deleted_by NULL (soft delete) · created_at.

### 3.10 `audit_log` (AUD-*)

id BIGINT · actor_id NULL · action VARCHAR(60) · entity_type VARCHAR(40) (`lead`, `user`, `task`, `attachment`, `list_value`, `target_template`, `setting`, `session`) · entity_id NULL · before_json, after_json JSONB NULL (only changed keys for updates) · details VARCHAR(500) · created_at. Indexes on (entity_type, entity_id, created_at), (actor_id, created_at), created_at.

Action catalogue: `user.created/updated/password_changed/terminated/target_assigned`, `lead.created/queued/updated/transferred/reassigned/approved/rejected/archived/restored/call_logged/email_logged/visit_logged/note_logged`, `task.created/updated/completed`, `attachment.uploaded/replaced/deleted`, `list_value.created/renamed/updated/reordered`, `target_template.created/updated`, `setting.updated`, `seed.sample_data`.

### 3.11 `target_templates` (TGT-*)

id · name VARCHAR(80) UNIQUE · stage · daily_leads · weekly_leads · daily_visits · weekly_visits · monthly_conversions · timestamps. Seeded: Onboarding (2/10/1/4/1), Training (3/15/2/8/2), Full Productive (5/25/3/12/4).

### 3.12 `app_settings`

setting_key PK · value_json. Keys: `role_labels` `{admin, sales_manager, recruiter}` (ROLE-02), `reminders` `{inactivityDays, rules: [{statusId, bdActionId, days}]}` (TASK-05: list-value ids or null for "any"; a rule needs at least one of the two; duplicates of a pair collapse; 1–365 days), `business_calendar` `{holidays: [{date, name}]}` sorted by date (RPT-03, TASK-03).

### 3.13 `schema_migrations`

version PK · name · applied_at. Versions: 7 notifications, `users.notification_prefs`, `job_runs`, and the `digests` setting (§3.17–3.18); 1 core schema; 2 `users.auto_logout_time` and the `business_calendar` setting; 3 `gmail_connections`; 4 status reasons (LEAD-06: `leads.status_reason_id`, the `lost_reason` and `disqualified_reason` lists, the `lost` and `disqualified` status rows); 5 sales trips (`business_type` list, `sales_trips`, `sales_trip_results`, §3.15); 6 `mail_outbox` (§3.16).

### 3.14 `gmail_connections` (MAIL-01)

user_id PK FK → users (CASCADE) · google_email VARCHAR(254) · refresh_token_encrypted TEXT (AES-256-GCM under SHA-256(`GMAIL_TOKEN_KEY`), stored as `iv.tag.ciphertext` base64) · created_at · updated_at. One link per user; reconnecting replaces it.

### 3.15 `sales_trips` and `sales_trip_results` (TRIP-*, migration 5)

`sales_trips`: id · owner_id FK users · title VARCHAR(120) · address VARCHAR(500) · latitude, longitude DOUBLE PRECISION NULL (geocoded origin) · radius_type `km` | `minutes` (CHECK) · radius_value SMALLINT · business_type_id FK list_values NULL (SET NULL) · max_results SMALLINT (≤ 50) · provider VARCHAR(40) (`stub` or `google`) · last_run_at · result_count · timestamps (updated_at trigger). Index (owner_id, created_at).

`sales_trip_results`: id · trip_id FK (CASCADE) · sequence · company_name VARCHAR(200) · address VARCHAR(500) · latitude, longitude · distance_km NUMERIC(7,2) NULL · drive_minutes SMALLINT NULL · website VARCHAR(2048) · phone VARCHAR(40) · provider_place_id VARCHAR(120) · job_count SMALLINT NULL (NULL = no job source) · jobs JSONB NULL (the dialog rows) · jobs_fetched_at · matched_lead_id FK leads NULL (SET NULL) · action_code VARCHAR(40) (`new` or a status code) · action_label VARCHAR(160) · shortlisted BOOLEAN · planned_visit_date DATE NULL · created_at. Index (trip_id, sequence). Results are a snapshot taken when the trip is created or re-run.

### 3.16 `mail_outbox` (MAIL_PROVIDER, migration 6)

id BIGINT · to_address · subject · status `stubbed` | `sent` | `failed` (CHECK) · error VARCHAR(500) NULL · text_body TEXT NULL (only for stubbed messages) · created_at. Every `sendMail` call records a row (the newest 500 are kept); a missing table never breaks the caller. Administrators see the latest 20 under Settings → Email delivery.

### 3.17 `notifications` (NTF-01/02, migration 7)

id BIGINT · user_id FK (CASCADE) · type (`task_assigned`, `task_updated`, `task_completed`, `lead_status`, `lead_transferred`, `queued_lead`, `queued_reviewed`, `file_uploaded`, `mention`, `message`, `daily_digest`, `weekly_digest`) · title VARCHAR(200) · body TEXT NULL · lead_id FK NULL (SET NULL) · task_id FK NULL (SET NULL) · read_at NULL · created_at. Index (user_id, read_at, id). `users.notification_prefs` JSONB `{dailyDigest, weeklyDigest, emailEvents}` (NTF-05; defaults true, true, false).

### 3.18 `job_runs` (TASK-06)

id · job (`daily` | `weekly`) · period_key (the business date, `week-<Monday>`, or `manual-<instant>-<actor>`) · status `running` | `success` | `partial` | `failed` · details · started_at · finished_at. UNIQUE (job, period_key) is the lock that makes a digest run once per period however many schedulers call in. The `digests` setting (`{enabled, dailyTime, weeklyDay, weeklyTime}`) lives in app_settings.

### 3.19 `lead_messages` (COLL-*, migration 8)

id BIGINT · lead_id FK (CASCADE) · parent_id FK self NULL (CASCADE; replies are kept one level deep, a reply to a reply is attached to the root) · author_id FK users · body TEXT (the rich-text format of §7.12, stored as written) · mentions JSONB (`[{kind: all|admin|recruiter|salesmanager} | {kind: user, userId, name}]`, parsed on save) · attachment_ids JSONB (ids of `lead_attachments` on the same lead, COLL-06) · quoted_message_id FK self NULL (SET NULL) · edited_at NULL · deleted_at NULL · deleted_by FK users NULL · created_at. Indexes (lead_id, id) and (parent_id). A removed message keeps its row and text (the API blanks the body, mentions, and attachments and reports who removed it); the audit entry `message.deleted` carries the original text.

---

## 4. Authentication and session design

| Topic | Design |
|---|---|
| Password hashing | Node `scrypt`, 16-byte random salt, 64-byte key, constant-time compare. Unknown accounts hash a dummy value so timing does not reveal existence (AUTH-01). |
| Session | 32 random bytes (base64url) in cookie `salestrackpro_session` (httpOnly, SameSite=Lax, Secure in production unless `APP_URL` is `http://`, 8 h). Only the SHA-256 hash is stored. Sessions are deleted on sign-out, password change (other sessions), termination, and deactivation. |
| Auto sign-out (AUTH-07) | On every request, if the account has `auto_logout_enabled` and the session was created before the latest occurrence of the account's `auto_logout_time` (default 23:00) in the business timezone, the session is deleted and the request is treated as signed out. |
| Two-factor (AUTH-06) | Password OK + `two_factor_enabled` → create `email_tokens` row (purpose `two_factor`, hash of a 6-digit code, hash of a random challenge), set cookie `salestrackpro_2fa` (10 min), email the code, respond `{requiresTwoFactor:true}`. `POST /api/auth/two-factor` matches cookie + code, max 5 attempts, then creates the session and clears the challenge cookie. Requires SMTP; sign-in explains when it is missing. |
| Password reset (AUTH-05) | `POST /api/auth/forgot-password` always returns 200 when SMTP exists (503 "not configured" otherwise); creates a 30-minute token (max 3 per 15 min per user) and emails `${APP_URL}/?reset=<token>`. The SPA reads `?reset=`, shows the reset form, and calls `POST /api/auth/reset-password`, which consumes the token and revokes all sessions. Admins can trigger the same email per user (invitation). |
| Rate limiting (AUTH-11) | `login_history` counts failures in the last 15 minutes (`NOW() AT TIME ZONE 'UTC'` minus an interval): ≥10 per email or ≥50 per address → 429. Works across instances and restarts. |
| CSRF | Every state-changing request must carry an `Origin` equal to the request origin, `APP_URL`, `TRUSTED_ORIGINS`, or the `X-Forwarded-Proto/Host` pair. Cookies are SameSite=Lax. |
| Bootstrap | While the `users` table is empty, `POST /api/users` with header `X-User-Management-Key` creates the first account as `admin`. The key is refused once any user exists. |

---

## 5. Authorization

### 5.1 Privileges and role defaults

| Privilege | Admin | Sales Manager | Recruiter | Meaning |
|---|---|---|---|---|
| view_leads | ✓ | ✓ | ✓ | Read leads, files, timeline |
| create_leads | ✓ | ✓ | | |
| edit_leads | ✓ | ✓ | | Edit **own** leads |
| edit_any_lead | ✓ | | | Edit any lead |
| transfer_leads | ✓ | ✓ | | Transfer **own** leads (OWN-02) |
| reassign_leads | ✓ | | | Reassign any lead, bulk, create for others (OWN-03) |
| archive_leads | ✓ | | | Archive/restore, bulk (SRCH-04) |
| review_queued | ✓ | | | Approve/reject; historical dates save directly (QUE-*) |
| add_notes | ✓ | ✓ | ✓ | NOTE-02 |
| collaborate | ✓ | ✓ | ✓ | Post, reply, quote, and edit own messages on leads (COLL-01..03, COLL-06) |
| moderate_messages | ✓ | | | Remove (soft-delete) any message with audit (COLL-04) |
| log_activities | ✓ | ✓ | | Calls, emails, visits |
| manage_tasks | ✓ | ✓ | | Create; update own/assigned tasks |
| plan_trips | ✓ | ✓ | | Sales Trip Planner: create and re-run trips, shortlist, plan visits, listings, export (TRIP-*) |
| upload_files | ✓ | ✓ | | |
| delete_files | ✓ | | | Soft delete; see deleted files (FILE-08) |
| view_reports | ✓ | ✓ | | Own report |
| view_team_reports | ✓ | | | Everyone's reports, team dashboard, all tasks |
| manage_users | ✓ | | | USR-* |
| manage_values | ✓ | | | LOV-* |
| manage_targets | ✓ | | | TGT-* |
| manage_settings | ✓ | | | Role labels, reminders |
| view_audit | ✓ | | | Audit endpoint and lead Audit tab |

Effective privileges = role defaults ∪ `users.privileges` (extras). Extras are stored only when they add to the defaults.

### 5.2 Lead-level rules

- `canEditLead(user, lead)` = `edit_any_lead` or (`edit_leads` and `lead.ownerId == user.id`).
- `canTransferLead(user, lead)` = `reassign_leads` or (`transfer_leads` and owner).
- Receiving owner must be active and not a Recruiter.
- Tasks: assignee, creator, or `edit_any_lead` may update; status changes set `completed_at`.
- Reports: a user may request their own report; others need `view_team_reports`.

---

## 6. API specification

All endpoints return JSON; errors are `{ "error": string }` with status 400 (validation; also PostgreSQL foreign-key, check, and data exceptions 23503/23514/22xxx), 401 (not signed in), 403 (forbidden/origin), 404, 409 (duplicate, unique_violation 23505), 429 (rate limit), 503 (database or mailer unavailable). State-changing methods require the `Origin` header (§4).

### 6.1 Authentication

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `GET /api/auth/session` | none | | `{ user \| null, needsSetup }` |
| `POST /api/auth/login` | none | `{ email, password }` | `{ user, expiresAt }` + session cookie, or `{ requiresTwoFactor, email }` + 2FA cookie |
| `POST /api/auth/two-factor` | 2FA cookie | `{ code }` | `{ user, expiresAt }` |
| `DELETE /api/auth/session` | session | | `{ ok }`; cookie cleared |
| `POST /api/auth/password` | session | `{ currentPassword, newPassword }` | `{ ok }` |
| `POST /api/auth/forgot-password` | none | `{ email }` | `{ ok, message }` (503 without SMTP) |
| `POST /api/auth/reset-password` | none | `{ token, password }` | `{ ok }` |

### 6.2 Reference and settings

| Method & path | Auth | Response |
|---|---|---|
| `GET /api/reference` | session | `{ listValues (active, by key), users (active directory), roleLabels, inactivityDays, holidays (dates), targetTemplates, mailerConfigured, today, timeZone }` |
| `GET /api/settings` | session | `{ settings, mailerConfigured, mail: { provider: stub\|smtp\|off, outbox (latest 20, administrators only) }, timeZone }` |
| `PATCH /api/settings` | manage_settings | `{ roleLabels?, reminders? { inactivityDays, rules? }, holidays? [{date, name}] }` → `{ settings }` (holidays: valid dates, names ≤ 80 characters, ≤ 400 entries, duplicates collapse; rule ids must exist in the status and BD action lists) |

### 6.3 Users

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/users` | manage_users (or `?mode=directory` for any user; or bootstrap key) | `{ users }` |
| `POST /api/users` | manage_users or bootstrap key | CreateUserInput → `{ user }` (201) |
| `GET /api/users/{id}` | manage_users | `{ user, loginHistory }` |
| `PATCH /api/users/{id}` | manage_users | partial user (names, email, phone, role, stage, extraPrivileges, twoFactorEnabled, autoLogoutEnabled, autoLogoutTime `HH:MM`, targetTemplateId, active). Guards: last active admin, self-deactivation. |
| `POST /api/users/{id}/terminate` | manage_users | `{ reassignToUserId, reason }` → `{ leadsReassigned, tasksReassigned, user }` |
| `POST /api/users/{id}/password` | manage_users | `{ password }` |
| `POST /api/users/{id}/reset-link` | manage_users | emails a set-password link (503 without SMTP) |

### 6.4 Leads

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/leads` | view_leads | Query: `state` (active/queued/archived), `q`, `mine`, `statusCode`, `statusId`, `leadTypeId`, `leadCategoryId`, `companySizeId`, `cityId`, `ownerId`, `clientResponseId`, `bdActionId`, `firstContactFrom/To`, `followUpFrom/To`, `contractSignedFrom/To`, `sort` (last_activity/first_contact/follow_up/client_name/owner/created), `direction`, `page`, `pageSize` → `{ leads, total, page, pageSize }` |
| `POST /api/leads` | create_leads | LeadInput (+ `ownerId` for admins) → `{ lead }` (201); queued when historical and no review privilege |
| `GET /api/leads/{id}` | view_leads | `{ lead, activities, tasks, attachments, audit (if view_audit), permissions: { edit } }` |
| `PATCH /api/leads/{id}` | canEditLead | partial LeadInput → `{ lead }`; generates status/BD action/response/follow-up/edit timeline entries and a field-level audit diff |
| `POST /api/leads/{id}/transfer` | canTransferLead | `{ ownerId, reason }` |
| `POST /api/leads/{id}/review` | review_queued | `{ approve, comment }` |
| `POST /api/leads/{id}/state` | archive_leads | `{ state: active\|archived, reason }` |
| `POST /api/leads/{id}/activities` | add_notes (note) / log_activities (call, email, visit); manage_tasks for `followUpTask` | `{ type, summary, body, occurredAt, followUpTask?: { title, description?, dueAt, assigneeId? (owner), priority?, setFollowUpDate? } }` → `{ activity, task, lead }`. The task is created after the activity (active leads only); with `setFollowUpDate` and edit rights the lead's follow-up date moves to the due date (business-timezone day). |
| `GET /api/leads/{id}/attachments` | view_leads | `{ attachments }` |
| `POST /api/leads/{id}/attachments` | upload_files | multipart `file`, `category`, `label` → `{ attachment }` |
| `POST /api/leads/bulk` | archive_leads / reassign_leads | `{ ids, action: archive\|restore\|reassign, ownerId?, reason? }` → `{ count }` |
| `GET /api/attachments/{id}` | view_leads | file bytes; `inline` for PDF/image/text, `attachment` otherwise or with `?download=1`; `nosniff`, CSP sandbox |
| `DELETE /api/attachments/{id}` | delete_files | soft delete |

LEAD-06/07: `LeadInput.statusReasonId` is required when the status code is `lost` or `disqualified` (400 "Choose a reason for the … status" otherwise) and is stored as NULL for every other status, even when sent; `GET /api/leads` filters by `statusReasonId`; every lead summary carries `statusReason` and `statusLabel` ("Status – Reason"). `POST /api/list-values` refuses the fixed `disqualified_reason` list. Sales Trip endpoints: §6.9.

### 6.5 Tasks

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/tasks` | session | `scope=mine\|all` (all needs view_team_reports), `status`, `leadId` → `{ tasks }` |
| `POST /api/tasks` | manage_tasks | TaskInput → `{ task }` |
| `GET /api/tasks/{id}` | session | `{ task }` |
| `PATCH /api/tasks/{id}` | canManageTask | partial TaskInput + `status` |

### 6.6 Dashboard and reports

| Method & path | Auth | Response |
|---|---|---|
| `GET /api/dashboard?scope=mine\|team` | session | `{ today, metrics {calls,emails,visits: {thisWeek,lastWeek}}, followUps {overdue,today,tomorrow}, targets, inactiveLeads, inactivityDays, inactiveLimits {leadId: days}, inactivityRuleCount, openTasks, overdueTaskCount, recentLeads, teamWide }` |
| `GET /api/reports?period=&userId=&stage=&templateId=` | view_reports | `{ range, rows: PerformanceRow[], series: daily points }`; `stage` and `templateId` (RPT-05) apply to team reports and compare against each person's resolved template |
| `GET /api/reports/export?period=&userId=&stage=&templateId=&format=xlsx\|pdf` | view_reports | `.xlsx` (Performance, Daily, Report sheets) or `.pdf` (landscape table with totals) of the same report (RPT-06) |
| `GET /api/reports/drilldown?period=&userId=&metric=` | view_reports | `{ activities }` \| `{ leads }` \| `{ tasks }` |

### 6.7 Administration

| Method & path | Auth |
|---|---|
| `GET /api/list-values?includeInactive=1` | session (inactive only for manage_values) |
| `POST /api/list-values` `{ listKey, value }` · `PATCH /api/list-values/{id}` `{ value?, active?, sortOrder? }` · `POST /api/list-values/reorder` `{ listKey, orderedIds }` | manage_values |
| `GET /api/target-templates` · `POST` · `PATCH /{id}` · `POST /{id}/assign` `{ userIds }` | session / manage_targets |
| `GET /api/audit?entityType=&entityId=&actorId=&limit=` | view_audit |

### 6.8 Gmail (MAIL-01, MAIL-03)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/gmail` | session | `{ configured, connectedEmail, allMailboxes }` (allMailboxes = view_team_reports) |
| `DELETE /api/gmail` | session + same origin | removes the link and its token; audit `gmail.disconnected` |
| `GET /api/gmail/connect` | session | sets a 10-minute `salestrackpro_gmail_state` cookie (path `/api/gmail`) and redirects to Google consent (scope `gmail.readonly openid email`, offline access) |
| `GET /api/gmail/callback` | session | verifies `state`, exchanges the code, stores the encrypted refresh token and the Google email, audit `gmail.connected`; redirects to `/?gmail=connected\|denied\|failed`, which the shell shows as a toast |
| `GET /api/leads/{id}/emails` | view_leads | `{ emails (newest 25 across mailboxes), failures }` for the lead's `client_emails`; the viewer's mailbox, or every connected mailbox for view_team_reports. Each mailbox is queried live (`from:/to:/cc:` search, ten messages per mailbox); a mailbox whose token no longer works counts as a failure instead of breaking the response |

### 6.9 Sales trips (TRIP-*)

All need `plan_trips`. A trip is visible to its owner and to anyone with `view_team_reports`.

| Method & path | Request → response |
|---|---|
| `GET /api/trips` | `{ trips (own, or all for team reporters, newest first), provider: { configured, name, jobsConfigured, message } }` |
| `POST /api/trips` | `{ title, address, radiusType: km\|minutes, radius, businessTypeId?, maxResults ≤ 50 }` → geocodes, searches, matches leads, stores the snapshot → `{ trip, results }` (201). 400 when the address cannot be located, 502 when the provider fails, 503 when no provider is configured |
| `GET /api/trips/{id}` | `{ trip, results }` |
| `POST /api/trips/{id}/run` | Re-runs the search with the trip's criteria; results, shortlist, and planned visits start over (owner or `reassign_leads`) |
| `PATCH /api/trips/{id}/results/{resultId}` | `{ shortlisted?, plannedVisitDate? (YYYY-MM-DD or null) }` → `{ result }`. Planning a visit shortlists the company; removing it from the shortlist clears the visit |
| `GET /api/trips/{id}/results/{resultId}/jobs` | `{ result, jobs }`, refreshed from the job source when missing or older than a day |
| `GET /api/trips/{id}/export?scope=all\|filtered\|shortlisted\|planned&action=` | `.xlsx` with a Companies sheet (Company, Company Address, Distance, Hiring, Action, Website, Phone, Shortlisted, Planned visit) and a Trip sheet |
| `GET /api/trips/{id}/export?…&format=pdf` | `.pdf` field-visit report of the same scope (title block, scope, Company, Company Address, Distance, Hiring, Action, Phone, Planned visit) |

Audit actions: `trip.created`, `trip.run`, `trip.shortlisted`, `trip.visit_planned` (entity type `sales_trip`).

### 6.10 Notifications, preferences, and jobs (NTF-*, TASK-06)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/notifications?limit=&unread=1` | session | `{ notifications (newest first), unread }` for the signed-in user |
| `PATCH /api/notifications` | session | `{ ids?: number[], all?: true }` → marks read → `{ unread }` |
| `PATCH /api/auth/preferences` | session | `{ dailyDigest, weeklyDigest, emailEvents }` → `{ user }`; audited as `user.preferences_updated` |
| `POST /api/jobs/run` | `X-Jobs-Key` header, or an administrator session | With the key: runs every digest that is due (`{ force?: true, job? }` forces one). With a session: `{ job: daily\|weekly, force: true, onlyMe?: true }` sends that digest to the caller (or everyone when `onlyMe: false`). → `{ ran: [{ job, periodKey, recipients, failures }], settings }`; 403 otherwise |

Digest runs are audited as `digest.daily` / `digest.weekly` (entity type `job`).

### 6.11 Collaboration messages (COLL-*)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/leads/{id}/messages` | view_leads | `{ threads: [{ root, replies[] }] }`, newest thread first, replies oldest first; removed messages appear with an empty body, `deletedAt`, and `deletedByName` |
| `POST /api/leads/{id}/messages` | collaborate, same origin | `{ body, parentId?, quotedMessageId?, attachmentIds? }` → 201 `{ message }`; 400 when the body is empty or over 10,000 characters, when the thread or quoted message belongs to another lead; attachment ids not on the lead are dropped; audited as `message.posted`; an archived lead rejects posts in the client |
| `PATCH /api/messages/{id}` | collaborate (author only), same origin | `{ body }` → `{ message }` with `editedAt`; 403 for another author; 400 for a removed message; audited as `message.edited` (before and after excerpts); newly mentioned people are notified |
| `DELETE /api/messages/{id}` | moderate_messages, same origin | → `{ message }` marked removed; idempotent; audited as `message.deleted` with the author and full text |

Each message carries `authorName`, `authorRole`, `mentions`, `attachments` (`id`, `fileName`, `label`; download through `/api/attachments/{id}`), `quoted` (`id`, `authorName`, `excerpt`, or "(message removed)"), `editedAt`, `deletedAt`, `deletedByName`, `createdAt`. The lead 360 response (`GET /api/leads/{id}`) adds `messageCount` (live messages) for the tab label.

---

## 7. Domain logic

### 7.1 Lead lifecycle

```
create ──(first contact < yesterday and no review privilege)──► queued ──approve──► active
   └──────────────────────────────────────────────────────────────────────────► active
active ──archive──► archived ──restore──► active
queued ──reject──► archived (state_reason "Rejected: <comment>")
```

- "Yesterday" = today in the business timezone minus one day (QUE-01).
- Every state change writes a `state_change` activity and an audit entry with the reason.
- LEAD-06: `lost` and `disqualified` are closed statuses that keep the lead `active` (PRD open question 11 records the defaults). Setting either requires `status_reason_id` from the matching list (`enforceStatusReason` in the leads repository); changing to any other status clears it; a change of reason alone writes a `status_change` entry "Status reason updated: …". The `status_change` summary uses the combined label ("Status changed from Warm to Disqualified – Not Interested") while `value_code` stays the status code, so conversion counting (§7.2) is unchanged. The dashboard's needs-attention list skips closed leads; the `cold/warm/hot/client` navigation views are unchanged.

### 7.2 Timeline and last activity

`addActivity` inserts the row and sets `leads.last_activity_at = GREATEST(current, occurred_at)`. Status changes carry `value_code` = new status code; a change to `client` counts as a **conversion** for targets and reports.

### 7.3 Field-level audit

`diffRecords(before, after)` compares readable snapshots (display names rather than ids) and stores only changed keys. Updates with no effective change produce no audit entry.

### 7.4 List-value rename semantics (LOV-03)

Leads store the value id, so renaming updates every display immediately. The audit entry holds the old and new text. `code` never changes, which keeps status-driven logic stable.

### 7.5 Transfer and termination cascade (OWN-*)

Transfer: update owner → move open tasks on that lead from the old owner to the new owner → `transfer` activity with from/to/reason → audit `lead.transferred` (by owner) or `lead.reassigned` (by someone else). Termination: for each owned lead, the same reassignment with "account terminated"; all open tasks assigned to the person move; `is_active=false`, `terminated_at` set; sessions deleted; audit `user.terminated` with counts. The last active administrator cannot be terminated, demoted, or deactivated.

### 7.6 Attachments (FILE-*)

Files are written to `ATTACHMENT_DIR/<leadId>/<timestamp>-<random>.<ext>` with `wx` (never overwrite); only the relative key is stored. Allowed extensions map to canonical MIME types; limit 15 MB. Version = 1 + max version for the same lead, category, label, and case-insensitive file name; `replaces_id` links the chain. Soft delete hides the file from non-admins; bytes remain for audit.

### 7.7 Targets (TGT-*)

Template resolution: `users.target_template_id` if set, else the first template whose stage equals the user's stage.
Action Center progress: leads created this week vs `weekly_leads`; visits logged this week vs `weekly_visits`; conversions month-to-date vs `monthly_conversions`; overall % = mean of min(achieved/target, 1) over components with a target.
Report "Target %": targets are scaled to the period — `daily_leads × business days` (or `weekly_leads × weeks` when no daily figure), same for visits, `monthly_conversions × days/30` (minimum 1).

### 7.8 Report periods (RPT-03)

Computed in the business timezone: today; yesterday = previous working day (Mon–Fri minus business-calendar holidays); this week = Monday to today; last week = previous Monday to Sunday; month to date; last month; year to date. Daily series buckets activity instants by business day.

### 7.9 Dashboard composition (AC-*)

Calls/emails/visits = counts of user-logged activities by type for this week and last week (own, or whole team for admins). Follow-ups = active leads by `follow_up_date` (< today, = today, = tomorrow). Needs attention (TASK-05) = active leads (not Lost Lead or Disqualified) whose `last_activity_at` is older than the limit that applies to them: `resolveInactivityDays` picks the rule for status + BD action, else BD action, else status, else `inactivityDays`; candidates are read once with the shortest configured limit and filtered in memory; `inactiveLimits` reports the limit per flagged lead. Open tasks = assignee's open tasks (overdue count by `due_at`). Recent leads = active leads by `last_activity_at`.

The twelve queries behind the dashboard are independent and run concurrently on the connection pool (`Promise.all`), as do the count and page queries of the lead list and the ten count and series queries of the performance report (the latter resolves target templates from one `listTargetTemplates` call). The joined lead query plans in about 16 ms on a warm connection, so running these in sequence was what made the Action Center slow once the tracker import brought the lead count to about 3,800. Measured after the change on that data: team dashboard 50–90 ms, lead list 30 ms, search 50 ms, reports 15–60 ms. Bulk loads end with `ANALYZE` so the planner has fresh statistics.

---

### 7.11 Notifications and digests (NTF-*, TASK-06)

`notifyUsers(db, { userIds, actorId, type, title, body, leadId, taskId })` inserts one row per target inside the caller's transaction, never notifies the actor about their own action, and emails targets whose `emailEvents` preference is on when a mail provider is configured (failures are logged, never thrown). Producers: `createTask`/`updateTask` (assignee; creator on completion by someone else), `updateLead` (owner, on status or reason change), `transferLead` (both owners), `createLead` when queued (everyone with `review_queued`), `reviewQueuedLead` (creator and owner), `uploadAttachment` (owner).

`runDigestJobs` (`features/notifications/digests.ts`): for each job that `isDigestDue` says is due (business time zone; weekly only on `weeklyDay`), claim `(job, period_key)` in `job_runs`, then for every active non-recruiter user who has not opted out build the digest from `buildDashboard(user, "mine")` and `performanceReport` (yesterday for the daily digest, last week for the weekly one, plus the team report for `view_team_reports`), store it as a notification, and email it. A forced run uses a unique manual period key and may target only the caller. The client polls `GET /api/notifications` every 60 s and after every data change.

### 7.12 Collaboration threads, mentions, and rich text (COLL-*, NOTE-03)

**Rich text** (`lib/richtext.ts`): a Markdown-like subset parsed into blocks (paragraphs, bulleted lists from `-`, `*`, or `•`, numbered lists from `1.` or `1)`) and inline nodes (`**bold**`, `_italic_` or `*italic*` at word boundaries, `[text](https://…)` links, bare `http(s)://` URLs with trailing punctuation left out). Only `http`, `https`, and `mailto` targets become links; anything else stays text. `RichText` (shell) renders the tree as React elements, so user input never reaches the page as HTML. `richTextToPlain` feeds quotes, notification bodies, and emails. The composer toolbar wraps the selection or prefixes lines; it never produces HTML.

**Mentions** (`features/messages/model.ts`): `parseMentions` finds the four groups (`@all`, `@admin`, `@recruiter`, `@salesmanager`, case-insensitive, not inside email addresses) and any active directory name written as `@First Last` (longest name first, so "Sam Sellers" is not read as "Sam Seller"); the result is stored with the message. `mentionRecipients` expands groups to active users by system role. The composer offers suggestions while typing after `@` (keyboard: arrows, Enter or Tab, Escape).

**Notifications**: posting notifies mentioned people (`mention`: "A mentioned you on Lead") and then the lead owner plus every other author in the thread (`message`: "A posted/replied on Lead"), never the actor and never twice. Editing notifies only people newly mentioned. Removal notifies nobody; the audit entry carries the text.

**Live updates (COLL-05)**: the tab refetches the thread list every 20 s and after every change; presence and typing indicators are deferred (PRD open question 15).

### 7.10 Natural-language dates (TASK-03, NOTE-05)

`src/lib/natural-dates.ts` is a dependency-free parser shared by the browser (live preview) and `tests/unit`. `parseNaturalDate(text, { anchor, holidays })` finds the earliest date phrase (a phrase inside a longer one, such as "Feb" inside "Feb 1", is ignored) and resolves it against the anchor calendar date: relative words (today, tomorrow, day after tomorrow, next week/month/quarter/year, end of week/month/year), weekday names, periods ("in two weeks", "six months", "3 business days"), month names alone (first working day of the next such month, year included when given), and explicit dates in several spellings (`Feb 1`, `1st of February 2027`, `Feb/01/2027`, `02/01/2027` month first, `2027-02-01`). Working day = Monday to Friday minus the `business_calendar` holidays. Relative results and month names roll forward to the next working day and report `adjusted`; weekday names move only when they hit a holiday; explicit dates are kept as written. A time of day (`at 10am`, `3:30 pm`, `at 3` = 15:00, `14:45`, noon, morning 09:00, afternoon 14:00, evening 17:00, end of day 17:00) is read from the remaining text.

Client use: `features/tasks/NaturalDateField` shows "Understood “…” as <date> at <time>" and fills the date/time inputs, which stay editable (the confirmation step). It appears in `TaskFormDialog` and in the lead follow-up scheduler. `suggestFollowUp(text, { anchor, today, holidays, person, company })` (NOTE-05) additionally requires a next-step cue in the sentence holding the date (strong: follow up, call back, check in, reach out, touch base, remind, revisit, next step, schedule…; weak: will, need to, should, by, before, due, meet, send… unless the sentence also has a past-tense cue) and a date not before today. The note form uses the interaction date as the anchor, shows the offer with an editable title, date, and time, and sends `followUpTask` with the activity when the offer stays ticked.

## 8. Client application design

### 8.1 Shell

- `src/app/page.tsx` renders `App`: checks `/api/auth/session`; shows `AuthScreen` (login, 2FA code, forgot, reset, first-time setup) or `AppShell`.
- `AppShell` loads `/api/reference` once, provides `AppContext` (`user`, `reference`, `notify`, `navigate`, `openLead`, `openNewLead`, `can`, `roleLabel`, `dataVersion/bumpData`), renders the sidebar (items filtered by privilege, counts for queued leads and open tasks), topbar (global lead search, profile menu), the current view, the lead detail dialog, the new-lead dialog, and toasts.
- Routing: URL hash `#/<view>[/<param>][?query]` (`useHashRoute`). Views: `home`, `leads`, `all-leads`, `cold`, `warm`, `hot`, `client`, `queued`, `archive`, `lead/<id>`, `tasks[/<id>]`, `reports`, `targets`, `admin`, `values`, `settings`, `devices`, `lead-generation`, `planner`, `trips`, `trips/<id>` (Sales Trip Planner). Lead lists are keyed by view + query so navigation resets filters.
- Data loading: `useAsyncData(fetcher, refreshKey)` — memoized fetcher, derived `loading`, `reload()`, no synchronous state writes inside effects (satisfies the React Compiler lint rules). After any mutation, `bumpData()` refreshes lists and counts.
- Permissions in the UI mirror the server: buttons and navigation items render only when `can(privilege)`; the server remains authoritative.

### 8.2 Feature modules

| Folder | Components |
|---|---|
| `features/auth` | `AuthScreen`, `ChangePasswordDialog` |
| `features/dashboard` | `ActionCenter` |
| `features/gmail` | `LeadEmails` (Emails tab: configuration note, connect/disconnect, recent messages), `client.ts`, server `gmail.ts` (OAuth exchange, token encryption, Gmail search) |
| `features/leads` | `LeadListPage` (toolbar with status and reason filters, filters panel, bulk bar, pagination), `LeadTable`, `LeadFormDialog` (all fields; reason select for closed statuses), `LeadDetailDialog` (Overview, Timeline, Collaboration, Emails, Documents, Profiles shared, Tasks, Audit tabs; transfer, archive/restore, approve/reject, schedule follow-up, quick BD action/response/status updates, `StatusReasonDialog` for Lost Lead and Disqualified, inline reason select) |
| `features/tasks` | `TasksPage` (Overdue / Today / Upcoming / Done columns, mine/team), `TaskFormDialog` (lead search, assignee, typed or picked due date, priority, checklist), `NaturalDateField` (TASK-03 preview) |
| `features/reports` | `ReportsPage` (period chips, person, stage, and template filters, stat tiles, daily stacked bars, performance table with drill-down dialog, Excel and PDF export links via `/api/reports/export`, CSV export) |
| `features/admin` | `AdminPage` router, `UsersPanel` (+ `UserFormDialog`, password dialog, terminate dialog, login history), `ListValuesPanel`, `TargetsPanel`, `SettingsPanel` (role names, reminder days and needs-attention rules, digest schedule with send-now buttons, business-calendar holidays, email delivery mode and outbox), device placeholder |
| `features/users` | `UserDirectoryDialog` (person picker) |
| `features/notifications` | `NotificationsMenu` (top-bar bell: unread badge, dropdown, mark read, open lead or task, expand digests), `PreferencesDialog` (profile menu → Notification preferences), `digests.ts`, `repository.ts`, `model.ts` |
| `features/messages` | `CollaborationTab` (composer with formatting toolbar, @mention picker, file references; threads with Reply, Quote, Edit, Remove), `client.ts`, server `repository.ts` (threads, post, edit, remove, notifications, audit), `model.ts` (input validation, mention parsing and recipients) |
| `features/preview` | `LeadGenerationPage`, `PlannerPage` (labelled previews) |
| `features/trips` | `TripsPage` (new-trip form with the six criteria of TRIP-01, list of trips), `TripResultsPage` (sortable columns, Action filter, Show selector for all / shortlisted / planned visits, shortlist checkboxes, planned-visit dates, job-listings dialog, Excel export link, print), `matching.ts` (TRIP-07 rules), `providers/` (`types`, `stub`, `google`, selector) |
| `features/shell` | `App`, `AppShell`, `AppContext`, shared `Dialog`, `Tabs`, `Field`, `Pagination`, `PromptDialog`, `Avatar`, `StatusPill`, `EmptyState`, `RichText` (NOTE-03 renderer) |

### 8.3 Styling

Hand-written CSS in `globals.css` (existing design system: 10–13 px type, `#586be3` primary, `.panel`, `.button*`, `.lead-table`, `.status-pill.status-<code>`, `.avatar-<tone>`), plus an appended section for filters, dialogs, timeline, tasks, reports, and admin. Breakpoints at 1500, 1180, 900, and 640 px; the sidebar collapses to icons and becomes a drawer on mobile (NAV-01).

---

## 9. Screen designs (BRD Appendix A) and as-built mapping

### A1. Login / Authentication — implemented (Google and device policy planned)

```
+--------------------------------------------------------------+
| SALES TRACKER                                                |
| Email [________________________]                              |
| Password [____________________]  [Forgot Password]            |
| [ Sign In ]                 [ Continue with Google ]          |
|--------------------------------------------------------------|
| If 2FA enabled: OTP [______] [Verify] [Resend]                |
| Authorized company device required when device policy active |
+--------------------------------------------------------------+
```
As built: email/password, "Forgot your password?", first-time setup link (only while no account exists), 2FA code step, reset-password form reached from the emailed link.

### A2. Sales Manager Action Center — implemented

```
+----------------------+-----------------------------------------------+
| LEFT NAV             | Calls          Emails         Visits          |
| Home                 | This  24       This  31       This  12        |
| My Leads             | Last  19       Last  27       Last   9        |
| All Leads            |-----------------------------------------------|
| Cold / Warm / Hot    | YESTERDAY - OVERDUE                           |
| Client               | Acme Co | Warm | Followup Call | Oct 12       |
| Queued Leads         |-----------------------------------------------|
| Archive              | TODAY                                         |
| Lead Generation      | Beta Co | Hot | Meeting | Oct 13              |
| Tasks                |-----------------------------------------------|
| Road Visit Planner   | TOMORROW                                      |
| Dashboard / Reports  | Gamma Co | Cold | First Call | Oct 14         |
+----------------------+-----------------------------------------------+
```
As built: three metric cards plus a target card; Overdue/Today/Tomorrow tabs; targets panel; "Needs attention" and "Open tasks" panels; recent leads table; team scope toggle for admins.

### A3. Lead List / Search / Filter — implemented

```
| Leads                              [+ New]     |
| Search [keyword anywhere...] [Search]          |
| Filters: Status Owner City Category Size ...  |
| [Apply] [Clear] [Archive Selected - Admin]     |
|-----------------------------------------------|
| □ Client | Status | Owner | Follow-up | Action|
| □ Acme   | Hot    | Sara  | 10/14     | View  |
| □ Beta   | Warm   | Pankaj| 10/15     | View  |
```
As built columns: select, Client (name, executive, city), Status, Last BD action (+ relative last activity), Follow-up (or Reason in Archive), First contact, Owner, row action (open / approve-reject / restore). Filters panel with eleven filters and date ranges; sort selector; bulk bar (archive, restore, reassign); pagination.

### A4. Add / Edit Lead — implemented

```
| Lead Type [v]   Owner [Auto/Transfer v]  First Contact [MM/DD/YYYY] |
| Client Name [________________] Category [Skilled v] Size [Medium v] |
| BD Action [v]   Client Response [v]      Status [v]                 |
| Address [________________________] City [v] Follow-up [__/__/____]  |
| Client Executive [________] Phone [________] Ext/Alt [________]     |
| Email [____________________] Industry [________________________]     |
| Positions [____________________________________________________]     |
| Contract Signed [__/__/____]                                        |
| Interaction Notes [ rich text / microphone Voice-to-Text ]          |
| Visiting Card: [Camera] [Upload] [OCR Extract]                       |
| Documents [Upload]  Profiles Shared [Upload Multiple]                |
```
As built: all fields in a two-column dialog; owner selector for admins on create; historical-date hint. Notes, files, and profiles are on the lead detail (A5); voice and OCR are planned.

### A5. Lead Detail / 360° View — implemented (AI summary and stored email threads planned)

```
| ACME CO  [Hot] [Owner: Sara] [Transfer]      |
| AI SUMMARY: Email | Interactions | Next Action|
| Tabs: Overview | Timeline | Email | Files     |
|       Profiles | Tasks | Collaboration | Audit|
| Latest interactions (newest first)            |
| [Add Note] [Mic] [Message @user/@all...]      |
```
As built tabs: Overview, Timeline (log call/email/visit, add note), Collaboration (A7, §7.12), Emails (Gmail, A6), Documents, Profiles shared, Tasks, Audit (admins). Header actions: Edit, Transfer, Approve/Reject, Archive/Restore; status select in the header.

### A6. Gmail / Email Tab — partial: recent messages through a connected Gmail account (see §6.8 and §10.2)

```
+---------------------------------------------------------------------+
| LEAD: ACME CO > EMAIL                                               |
| Owner mailbox: sales.manager@company                                |
| AI Email Summary: [key points / commitments / pending responses]    |
|---------------------------------------------------------------------|
| Thread: Subject: Staffing Requirement                               |
| Client -> Owner   Oct 12 ...                                        |
| Owner -> Client   Oct 12 ...                                        |
| Client -> Owner   Oct 13 ...                                        |
| [Reply] [Forward] [Attach] [Create Task] [AI Suggest Follow-up]     |
+---------------------------------------------------------------------+
```

### A7. Collaboration / Tasks — implemented (presence and typing indicators planned, §10.3)

```
+---------------------------------------------------------------------+
| COLLABORATION                                                       |
| @user @all @admin @recruiter @salesmanager                         |
| [Rich-text message........................................] [Send]  |
| Thread / replies / quote / edit own / timestamps                    |
|---------------------------------------------------------------------|
| TASKS [+ Create Task]                                               |
| Follow-up call | Assignee [v] | Due [Tomorrow] | Priority [High]    |
| Checklist: □ Call HR  □ Send profiles  □ Update lead                |
+---------------------------------------------------------------------+
```
As built: the Collaboration tab on a lead implements the upper half (threads, replies, quotes, own edits, Admin removal, @mentions with a picker, rich text, file references; §6.11, §7.12). The Tasks page (Overdue / Today / Upcoming / Done) and the Tasks tab on a lead implement the lower half, including assignee, due date and time, priority, and checklist.

### A8. Lead Generation — preview page (planned, §10.4)

```
+---------------------------------------------------------------------+
| LEAD GENERATION                                                     |
| Company [________________] URL [________________________]            |
| Radius (km) [___]                                      [Generate]   |
| Company / Industry Summary                                          |
| Open Positions | Hiring Challenges | Interview Summary | Reviews    |
| AI Engagement Approach | AI Introduction Email                      |
| Similar Companies within radius                                     |
| [Save Result] [Create Lead] [Add to Road Visit]                     |
+---------------------------------------------------------------------+
```
As built: the form and a sample brief render; "Create Lead" opens the new-lead form. Saving results, the sections, and "Add to Road Visit" await the data sources.

### A9. Road Visit Planner — preview page (planned, §10.5)

```
+---------------------------------------------------------------------+
| ROAD VISIT PLANNER  Date [__/__/____]                               |
| Companies: [Add Company]                                            |
| 09:00 Company A  -> 10:15 Company B -> 11:30 Company C              |
| 13:30 LUNCH (30 min) -> 14:15 Company D -> 15:30 Company E          |
| [Optimize Route] [View Company Briefs] [Open Positions]             |
+---------------------------------------------------------------------+
```
As built: a sample route with the lunch stop is shown; date selection, adding companies, optimization, briefs, and open positions await a routing service and data sources.

### A10. Admin Performance Dashboard — implemented

```
| Period: Today | Yesterday | This Week | Last Week | MTD | Last | YTD|
| Leads Created | Calls | Emails | Visits | Conversions | Target %    |
| [Performance Graph / Trend]                                         |
| Name       Leads Calls Emails Visits Conv Target% [Drill Down]      |
| [Tool Engagement] [Lead Generation Report] [Export PDF/Excel]       |
```
As built: seven period chips, person filter, stat tiles, daily stacked bars, table with Leads, Updated, Calls, Emails, Visits, Notes, Conv., Tasks, Done, Files, Logins, Target %; numbers drill down; Excel (.xlsx) and CSV export. Lead-generation report and PDF export planned.

### A11. Admin User Management — implemented (device column planned)

```
| Name | Email | Role | Stage | 2FA | 11PM Logout | Devices | Actions|
| Actions: Edit | Terminate | Reset/Manage | Devices                  |
| Terminate -> Reassign leads to [Sales Manager/Admin/Self]           |
```

### A12. Admin Device Authorization — planned (placeholder page explains the dependency, §10.6)

```
+---------------------------------------------------------------------+
| DEVICE AUTHORIZATION                                                |
| Person [Sales Manager/Recruiter v]                                  |
| Device | Type | First Seen | Last Login | Status | Action           |
| ABC123 | Laptop | ... | ... | Authorized | [Revoke]                 |
| XYZ789 | Phone  | ... | ... | Pending    | [Authorize] [Reject]     |
+---------------------------------------------------------------------+
```

### A13. Admin List of Values — implemented

```
| Dropdown [BD Action v]                          [+ Add Value]        |
| Value                     Active   Order    Actions                  |
| Rename: Old [First Call] -> New [Initial Call] [Apply]              |
```

### A14. Admin Archive / Queued Leads — implemented

```
+---------------------------------------------------------------------+
| ARCHIVE / QUEUED LEADS                                              |
| Search [________] Filters [Owner][Status][Date][City] [Apply]       |
| □ Client | Owner | Date | Status | Reason | Action                  |
| □ Acme   | Sara  | ...  | Archived | ... | [Restore]               |
| Queued: past-dated lead -> [Approve] [Reject] [View Full Lead]      |
+---------------------------------------------------------------------+
```
As built: two views. Archive lists archived and rejected leads with their own search, filters, a Reason column, and Restore (single or bulk). Queued Leads lists past-dated leads with Approve and Reject (with comment) and opens the full lead.

### A15. Target Templates — implemented

```
+---------------------------------------------------------------------+
| TARGET TEMPLATES                         [+ New Template]            |
| Template: Full Productive                                           |
| Daily Leads [__] Weekly Leads [__] Road Visits [__] Monthly Conv [__]|
| Stage [Onboarding / Training / Full Productive]                     |
| [Save] [Assign to Sales Managers]                                   |
+---------------------------------------------------------------------+
```
As built: templates table (name, stage, daily/weekly leads, daily/weekly visits, monthly conversions, assigned people), New/Edit dialog, and an assign form that applies a template to one or more people.

### A16. Sales Trip Planner — implemented (change note of October 21, 2026; TRIP-01..11, §10.8)

```
+-----------------------------------------------------------------------------+
| SALES TRIP PLANNER                                          [+ New trip]    |
| Trip Title [______________]  Address [________________________________]     |
| Radius [__]  (o) km  ( ) driving minutes   Business Type [Any           v]  |
| Number of Results [25] (max 50)                                  [Search]   |
|-----------------------------------------------------------------------------|
| Filter: Action [All v]   Scope: (o) All ( ) Filtered ( ) Shortlisted        |
|                                 ( ) Planned visits   [Export Excel] [Print] |
| □ | Company ↕          | Company Address ↕            | Dist ↕ | Hiring ↕ | Action ↕    |
| □ | ABC Manufacturing  | 123 Example Rd, Mississauga  | 1.2 km | 8 Jobs   | Hot Lead    |
| ☑ | XYZ Foods          | 456 Sample St, Mississauga   | 2.4 km | 4 Jobs   | Warm Lead   |
| □ | Best Distribution  | 789 Industrial Rd, Mississ.  | 3.1 km | 2 Jobs   | Disqualified – Not Interested |
| [Add shortlisted to road visit on Date [__/__/____]]                        |
+-----------------------------------------------------------------------------+
| JOB LISTINGS – XYZ Foods (dialog)                                           |
| Title | Portal / Source | Location | Date Posted | Type | [View Job]        |
+-----------------------------------------------------------------------------+
```
As built: the form lives on the trips page with the list of planned trips below it; the results page has the Action filter, a Show selector (all / shortlisted / planned visits) that also sets the export and print scope, sortable headers, shortlist checkboxes, a planned-visit date per shortlisted company, "N Jobs" buttons opening the listings dialog, website links in a new tab, an "Open lead" link on matched rows, Run again, Export Excel, and Print (a print stylesheet renders the field-visit report with the trip header).

---

## 10. Designs for planned features

### 10.1 Google sign-in (AUTH-03)
OAuth 2.0 authorization-code flow with PKCE via a `/api/auth/google` start and `/api/auth/google/callback` route. Match the verified Google email to an active `users` row (no auto-provisioning, per AUTH-01), then create the normal session. Store the Google subject id in a new `user_identities(user_id, provider, subject)` table.

### 10.2 Gmail integration (MAIL-*)
As built (first cut, §6.8): per-user read-only Gmail link with the refresh token encrypted in `gmail_connections`; the Emails tab queries Gmail live for the lead's client addresses and lists the newest messages with body text. Still planned, as designed below: stored threads, owner-mailbox association on transfer, reply/forward, attachments, and summaries.

Target design: per-user mailbox authorization (Gmail API `readonly` + `send` scopes) with refresh tokens in `mailbox_connections`. A background sync (cron or queue) pulls messages whose participants match a lead's `client_emails` and stores headers/bodies in `lead_emails` (lead_id, message_id, thread_id, direction, from, to, subject, snippet, body, sent_at) and attachments metadata. Ownership change switches the mailbox used for future association; history stays. The Email tab renders threads; reply/forward call the Gmail send API. AI summaries (email and interaction) are generated by an LLM over the thread and timeline, cached in `lead_summaries` with a hash of the inputs and refreshed when inputs change.

### 10.3 Collaboration and notifications (COLL-*, NTF-*) — mostly as built
Threads, mentions, notifications, and the mailer are built (§3.17, §3.19, §6.10, §6.11, §7.11, §7.12). Remaining: push delivery (FCM/APNs) from the native app, and real-time presence and typing indicators through Server-Sent Events from `/api/events` with short-lived rows keyed by lead (PRD open question 15).

### 10.4 Lead generation (LGEN-*)
A `lead_generation_results` table (user_id, company, url, radius_km, payload JSON, created_at). Providers behind an interface: job sources (Indeed API or careers-page scraping where permitted), review sources (Google Places), company data, and an LLM for the approach and introduction email. Results convert to leads via the existing `POST /api/leads`.

### 10.5 Road visit planner (PLAN-*)
`road_visits` (user_id, date) and `road_visit_stops` (visit_id, lead_id or company, address, sequence, planned_at, sales_trip_result_id NULL); until then a planned visit is the `planned_visit_date` on a shortlisted trip result (§3.15). Optimization through a routing API (Google Routes or OSRM) with a fixed 30-minute break near 13:30. Completed stops log a `visit` activity, which already feeds targets and reports. Stops can be created from shortlisted Sales Trip results (§10.8); those are what the change note calls "Planned Visits" (TRIP-11).

### 10.6 Device authorization (AUTH-08..10)
`devices` (id, user_id, identifier, type, label, first_seen, last_seen, status) with the identifier coming from an MDM/managed-browser header or a native app. Login records the device; a policy flag per user refuses unknown devices. Admin screen A12 manages status.

### 10.7 Rich text, voice, OCR (NOTE-03, NOTE-04, OCR-*)
Rich text exists for collaboration messages (§7.12); timeline notes can adopt the same format and `RichText` renderer once the client confirms (the existing plain-text notes render unchanged because plain text parses to paragraphs). Voice via the Web Speech API on desktop/Android and native dictation on iOS, editable before save; the transcript feeds the same follow-up suggestion as typed notes (§7.10). OCR via a vision API with a review form before populating the lead.

### 10.8 Sales Trip Planner (TRIP-*, change note of October 21, 2026) — as built

**Tables (migration 5).** See §3.15; the design below is what was built. `sales_trips` (id, owner_id FK users, title VARCHAR(120), address VARCHAR(500), latitude and longitude DECIMAL(9,6), radius_type ENUM `km`/`minutes`, radius_value SMALLINT, business_type_id FK list_values NULL, max_results TINYINT ≤ 50, provider_meta JSON, created_at, updated_at) and `sales_trip_results` (id, trip_id FK CASCADE, sequence, company_name VARCHAR(200), address VARCHAR(500), latitude, longitude, distance_km DECIMAL(7,2), drive_minutes SMALLINT NULL, website VARCHAR(2048), phone VARCHAR(40), provider_place_id VARCHAR(120), job_count SMALLINT NULL, jobs JSON NULL (dialog rows: title, source, location, postedAt, employmentType, url), jobs_fetched_at NULL, matched_lead_id FK leads NULL (SET NULL), action_code VARCHAR(40), action_label VARCHAR(160), shortlisted BOOLEAN, created_at). Results are snapshotted at search time so the list stays stable; re-running a trip replaces its results and recomputes Action.

**Providers behind interfaces** in `features/trips/providers/`: `geocode(address)`, `searchCompanies({ lat, lng, radiusKm | driveMinutes, businessType, limit })`, `distances(origin, targets)` (and an isochrone or distance-matrix call for driving minutes), `jobs({ companyName, website, location })`. First implementations: Google Geocoding and Places (Nearby/Text Search with keyword rules per business type, website and phone from Place Details) and Routes/Distance Matrix under `MAPS_API_KEY`; a licensed job aggregator under `JOBS_API_URL`/`JOBS_API_KEY` (PRD open question 10); `TRIPS_PROVIDER=stub` serves a fixed catalogue of fourteen companies around Mississauga and Toronto (with websites, phones, and listings) for development and tests. Without keys and without the stub the page reports "not configured" the way Gmail and SMTP do. The Google adapter is written to the documented HTTP APIs but has only been exercised through the stub. Provider terms limit how long place data may be cached, so results keep the place id and refresh fields on re-run. Job listings are fetched for every result when the trip is created or re-run (four at a time) so the Hiring column shows counts at once; the dialog re-fetches a company's listings when they are older than a day. The aggregator contract: `GET ${JOBS_API_URL}?company=&website=&location=` with `Authorization: Bearer ${JOBS_API_KEY}` returning `{ jobs: [{ title, source, location, posted_at, employment_type, url }] }`.

**Action matching (TRIP-07).** Normalisation: company name lower-cased, punctuation removed, legal suffixes dropped (inc, ltd, limited, corp, co); website reduced to its registrable domain; phones reduced to their last ten digits; address reduced to street number, street name, and city. Candidates are non-archived leads; archived leads are considered only when nothing else matches (PRD open question 12). A lead matches on domain equality, phone equality, normalised name equality with the same city, or name similarity ≥ 0.9 (Jaro-Winkler) with a matching address. Precedence when several match: domain, then phone, then name with address, then name; ties go to the most recently active lead. Action = the matched lead's combined status label (LEAD-06; "New / Not in CRM" when nothing matches). `matched_lead_id` lets the row open the lead.

**API.** §6.9. "Planned visits" are dates on shortlisted results (`planned_visit_date`); they become `road_visit_stops` when the road visit planner (§10.5) is built. New privilege `plan_trips` (Admin and Sales Manager by default). Trips, re-runs, shortlist changes, and planned visits are audited.

**Client.** View `trips` (my trips, new-trip form with the six criteria of TRIP-01) and `trips/<id>` (A16): column sort on every column (TRIP-09), an Action filter listing the combined labels present in the results (TRIP-08), shortlist checkboxes (TRIP-10), export and print buttons with the scope selector (TRIP-11), the job-listings dialog (TRIP-06). Printing uses a `@media print` stylesheet that renders the field-visit report: trip title, date, address and radius, then Company, Company Address, Distance, Hiring, Action, and the planned time for rows on a visit. The Excel export is a real `.xlsx` written with `exceljs`; the same dependency upgrades the reports CSV export (RPT-06).

**Verification.** `tests/unit/trip-matching.test.mjs` (normalisation, domain, phone, address keys, Jaro-Winkler, precedence, archived fallback, Action labels) and `tests/e2e/06-trips.test.mjs` (a lead recognised by domain, the listings dialog, shortlist, planned visit, Show and Action filters, the Excel export responding with a spreadsheet, the trip list).

### 10.9 Legacy tracker import (go-live data) — as built

The client's current system of record is a Google Sheets workbook (`Sales Leads 2026.xlsx`, kept outside the repository because it holds real contact data). Its main sheet `LeadsDec25` is one row per interaction (6,681 rows, about 3,600 companies, May 2025 to October 2026) with the BRD's columns; `Clients` lists the companies that are clients; `ArchiveSales` is a 2021–22 pipeline with different columns; the other sheets are filtered copies and are ignored.

`scripts/import-tracker.mjs` (`npm run db:import -- "docs/Sales Leads 2026.xlsx" [--dry-run]`, or in Docker `docker compose run --rm setup node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" --dry-run`) reads the workbook with `exceljs`, finds the header row by its "Client Name" cell, and maps columns by name so small header differences between sheets do not matter. Everything runs in one transaction; `--dry-run` executes the whole import and rolls it back, so its report is exact. Pure rules live in `scripts/lib/tracker-mapping.mjs` (unit-tested in `tests/unit/tracker-mapping.test.mjs`).

Rules:
- **One lead per company.** Rows are grouped by the normalised company name (same rules as §10.8: case, punctuation, legal suffixes). Rows are ordered by date then sheet order and the latest non-empty value wins per field; emails are the union of all rows; positions are joined; the lead type is the most frequent value. `first_contact_date` is the earliest readable row date, `last_activity_at` the latest; `created_at` is set to the first contact date so historical reports count the leads in their real periods. Companies already in the database are skipped, which makes a re-run safe; a second run of the same file is refused unless `--force`.
- **One timeline entry per row** (`lead_activities.meta` records the sheet, row, step number, status, type, and Sales Manager): `bd_action` when the row has a BD action (summary "Action · Response", the step prefix "3 ." stripped, the step kept in meta), `client_response` when it only has a response, otherwise `note` from the Notes or Contact Remark cell. Notes and remarks go in the body. A `created` entry marks the import. Each lead gets a `lead.created` audit entry and the run one `import.tracker` entry carrying the file hash and the counts.
- **Lead types** "Office" and "Road_Trip" are imported as list values "Office" (created) and "Road Trip"; rows without a type default to Office.
- **BD actions**: the tracker's "Cold Call" / "Cold Email" are imported as the BRD's "First Call" / "First Email" unless `--keep-action-names`; typos ("Contract Clerification", "Waiting For Profile") map to the existing values; anything else ("Meeting") is created in the list. The two numbered sequences (road trip 1–11, office 1–10) collapse into the single BD-action list, with the step number kept per timeline entry (PRD open question 13).
- **Statuses** Cold / Warm / Hot / Client map by name; the archive's "Won" is Client; companies on the `Clients` sheet are set to Client; rows without a status default to Cold. Negative responses stay as responses (no Lost or Disqualified is inferred).
- **Cities** match case-insensitively; a trailing ", ON" is dropped; known misspellings ("St Catherines") map to the existing value; new cities are created in Title Case.
- **Contacts**: phone cells may be numbers, text, or several numbers ("905-… / 416-…"); the first becomes the phone, the next the alternate, the rest go to the contact remark; "N/A" is empty. Email cells are split on spaces, slashes, commas, and semicolons; invalid parts become a dated comment; an email found in the industry column moves to the emails.
- **Address / Comments**: text with a postal code, or a street number with a street word, or ", ON" is the address; everything else becomes a dated comment. Unreadable follow-up dates ("snow season") and stray text in the contract-signed column become dated comments too.
- **Dates** come from date cells (sanity range 2000–2100) or the text spellings the sheet uses (`Jan/20/26`, `20/08/2025`, month first when ambiguous as the sheet declares).
- **Sales Managers** are matched by name to accounts through a built-in map (Daniel, David, Gaya, Sara from the workbook's MasterData sheet; Adam assumed as adam@scilltech.com) or `--owner "Name=email"`; missing accounts are created as active Sales Managers with a random password so an administrator sends them a set-password link. Rows without a manager go to `--default-owner` (default: the acting administrator).
- **Archive sheet**: one archived lead per company not already present (reason "Imported from the 2021–22 archive sheet"), with the stage, quarter, and agreement date kept as comments; `--skip-archive` leaves it out.
- **Report** (`import-report.txt`, git-ignored): counts, every default applied with its count, accounts and list values created, rejected rows (no client name), companies skipped, and the row-level warnings by kind.

Verified on 2026-10-23 against the client's workbook: 3,611 leads and 226 archived leads from 6,681 + 290 rows, 10,506 timeline entries, 13 seconds, 12 rows rejected (no client name), 92 warnings, all listed in the report.

### 10.10 Opportunity Recommendation (OPP-*, BRD §25) — design sketch

**Tables.** `opportunity_channels` (id, name, type `api` | `feed` | `career_page` | `other`, status `active` | `paused` | `inactive`, config JSONB (provider key and settings, secrets encrypted like Gmail tokens), availability `all` | `selected` with `opportunity_channel_users`, priority, last_success_at, last_error, created_by, timestamps). `opportunity_search_terms` (id, owner_id, name, keyword, job_type_id FK list_values, location_id FK list_values, all_channels BOOLEAN, expiry_date, status `active` | `paused` | `inactive`, last_run_at, next_run_at, found_count, new_count, timestamps) with `opportunity_search_term_channels`. `opportunities` (id, owner_id, search_term_id, company_name, job_title, job_type, location, posted_on, summary TEXT, primary_channel_id, source_name, source_job_id, url, found_at, status `new` | `reviewed` | `converted` | `irrelevant`, irrelevant_reason_id FK list_values, matching_keyword, last_checked_at, matched_lead_id FK leads, match_kind `lead` | `client` | `opportunity` | `irrelevant` | NULL, converted_lead_id FK leads, dedupe_key VARCHAR(64)) with `opportunity_sources` (opportunity_id, channel_id, source_job_id, url, found_at) for every channel a listing appeared on. `opportunity_search_runs` (id, search_term_id, run_type `scheduled` | `on_demand` | `similar`, started_at, finished_at, channels JSONB, listings_found, new_count, duplicate_count, status `success` | `partial` | `failed`, error TEXT). `leads.opportunity_id` (LEAD-01 #26). Lists: `job_type`, `opportunity_location`, `irrelevant_reason`.

**Connectors.** One interface, `searchListings({ keyword, jobType, location, radiusKm?, since? }) → Listing[]`, implemented per channel type and selected by `channels.config.provider`; the Sales Trip Planner's job contract (§10.8) is the first API connector, a career-page connector fetches permitted pages and extracts postings, and a stub connector serves fixed listings for tests. Connectors run in isolation (per-channel try/catch, timeout, and run record) so one failure never stops a run (OPP-06, OPP-22).

**Scheduler.** A separate `jobs` process (`scripts/run-jobs.mjs` as a compose service, or an external cron hitting `POST /api/jobs/opportunities` with a shared secret) runs at the Admin-configured time and time zone, iterates active terms (capped by the per-manager maximum), writes runs and opportunities in one transaction per term, then queues the Daily Opportunity Report through the notification pipeline (§10.3) and the mailer. The same runner can carry the TASK-06 reminder digests.

**Dedupe and CRM match.** `dedupe_key` = SHA-256 of normalised (source job id ∥ url) when present, else (normalised company ∥ title ∥ location ∥ posting date); a Jaro-Winkler check on the summary catches near-duplicates across channels. The CRM check reuses `features/trips/matching.ts`: a matched lead, client, or earlier opportunity sets `match_kind` and `matched_lead_id` (OPP-07, OPP-09). Rediscovered opportunities keep their status.

**Screens.** Navigation item with submenu and badge (OPP-02); dashboard cards and grouped list (OPP-11, wireframe 25.24); search-term form with channel checkboxes and "Save & Run Now" (25.26); Admin channel screen with Test (25.25); Convert opens `LeadFormDialog` pre-filled and links both records (OPP-12); Irrelevant prompt with reason list (OPP-13); Find Similar opens the term form pre-filled (OPP-14); run history per term (OPP-16); channel and opportunity reports beside the performance report (OPP-18, OPP-19). Privileges: `manage_opportunities` (Sales Manager, Admin) and `manage_channels` (Admin).

**Open before building:** the job source licence (PRD open question 10) and where the scheduler runs (open question 14).

---

## 11. Security and deployment notes

- Run behind TLS; set `APP_URL` so the origin check and reset links use the public host. An `http://` `APP_URL` turns off the Secure cookie flag for deployments without TLS (internal hosts, the end-to-end stack); browsers drop Secure cookies over plain http on anything but localhost.
- The app database role has no DDL rights; schema changes go through `npm run db:create`, which runs as the PostgreSQL administrator.
- Attachments live outside the web root; downloads set `Content-Disposition`, `X-Content-Type-Options: nosniff`, and a sandboxing CSP.
- Session, reset, and 2FA secrets are stored only as hashes; cookies are httpOnly and SameSite=Lax.
- Error responses never include SQL or stack details; failures are logged server-side with context.
- Sign-in, reset, and 2FA attempts are rate limited in the database.

---

## 12. Verification

- `npm run typecheck`, `npm run lint`, `npm run build` must pass.
- Unit tests (`tests/unit`, `node:test` on Node 22 type stripping, `npm run test:unit`): the natural-language date parser (working days, relative phrases, weekday names, periods, month names, explicit spellings, times of day), the note follow-up suggestion rules, the status-reason helpers, the trip matching rules, and the needs-attention rule precedence.
- End-to-end API suite (kept outside the repo during development) covers: first-run setup, bootstrap key lock-out, login and origin checks, seeding, reference data, role permissions for every mutating endpoint, queued review, edit/transfer rules, activities, lead 360 and audit visibility, tasks and checklists, uploads with versioning and type rejection, downloads, soft delete, dashboard, team and own reports, all periods, drill-down, list-value rename propagation and inactive-value rejection, settings, templates and assignment, user updates with extra privileges, bulk archive/restore/reassign, login history, admin and self password changes, SMTP-missing responses, termination cascade and session revocation, last-admin guard, audit action coverage, rate limiting, sign-out.
- Browser end-to-end suite (`tests/e2e`, Selenium + `node:test`, run with `scripts/e2e.sh` against a production build, an in-memory PostgreSQL, and a Chromium grid in Docker): first-time setup, sign-in, password change, a reset request accepted in stub mail mode, lead life cycle (create, BD action, timeline, note that offers a follow-up task, Emails tab without Gmail configured, follow-up task, document upload, edit, status, search, archive/restore), tasks (including a due date typed in words), user creation, a per-account sign-out time ending an older session, role-limited navigation, queued-lead approval, transfer, termination hand-off, list of values, settings, business-calendar holiday, target templates, report drill-down.
- Notifications and digests (TASK-06, NTF-*): `tests/unit/digests.test.mjs` covers the due-time and weekday rules; `04-team.test.mjs` assigns a task to the new Sales Manager and checks the bell, the dropdown entry, and Mark all read; `05-admin-reports.test.mjs` sends the daily digest on demand and finds it in the outbox and the bell.
- Stub mail (MAIL_PROVIDER): `05-admin-reports.test.mjs` emails a set-password link from User management, opens it from the outbox under Settings, and completes the reset; the e2e stack runs with `MAIL_PROVIDER=stub`.
- Needs-attention rules (TASK-05): `tests/unit/inactivity-rules.test.mjs` covers rule precedence and validation; `05-admin-reports.test.mjs` adds a rule, reloads, and checks the Action Center heading; the same file filters the report by stage and fetches the PDF and Excel exports.
- Accessibility (NFR-07): `tests/e2e/07-accessibility.test.mjs` runs axe-core (WCAG 2.0/2.1 A and AA) on the sign-in screen, Action Center, lead dialog and timeline, lead list, tasks, reports, settings, list of values, user management, and the trip planner; serious or critical violations fail the test, lesser ones are printed.
- Status reasons (LEAD-06): `tests/unit/status-reasons.test.mjs` covers the reason-list mapping and the combined label; `02-leads.test.mjs` sets Disqualified with a reason from the lead header, checks the inline reason select and the timeline entry, and returns the lead to Warm.
- Legacy tracker import (§10.9): `tests/unit/tracker-mapping.test.mjs` covers dates, BD-action prefixes and aliases, statuses, lead types, emails, phones, address detection, city clean-up, and field merging; the script itself is verified with `--dry-run` against the client's workbook (counts in §10.9).
- Collaboration (COLL-*, NOTE-03): `tests/unit/richtext.test.mjs` covers the inline and block parser, unsafe links, and the plain-text form; `tests/unit/messages.test.mjs` covers mention parsing, group expansion, and input validation; `02-leads.test.mjs` posts a message with bold, a list, and an @admin mention picked from the suggestions, replies with a quote, edits the reply, removes it as an administrator, and checks the tab count; `04-team.test.mjs` mentions the Sales Manager on a transferred lead and finds the mention in their bell; `07-accessibility.test.mjs` audits the Collaboration tab.
- Sales Trip Planner: `tests/unit/trip-matching.test.mjs` covers the matching rules; `06-trips.test.mjs` plans a trip on the stub provider, checks the recognised lead, the job listings, shortlist and planned visit, filters, the Excel export, and the trip list.
