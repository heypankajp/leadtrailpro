# SalesTrackPro — Technical Specification (SPEC)

| | |
|---|---|
| Source | `Sales_Tracker_App_BRD_SRS.docx` v1.0 (October 13, 2026) and the current codebase |
| SPEC version | 1.1 — October 18, 2026 (1.0: October 17, 2026) |
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
   ├─ MySQL 5.7+/8.x  (restricted app account: SELECT/INSERT/UPDATE/DELETE only)
   ├─ Local file storage for attachments (ATTACHMENT_DIR)
   └─ SMTP (nodemailer) for reset links and two-factor codes
```

**Conventions**

- Feature folders: `model.ts` (shared types, validation, pure helpers; importable by the client), `repository.ts` (server-only SQL and business rules), `client.ts` (browser fetch wrappers), React components.
- All route handlers: validate origin for state changes → load the session user → check privilege → parse body → call repository → map errors with `handleRouteError` (which rethrows Next.js internal signals first).
- Every mutation runs in one transaction with its audit entry and timeline entry.
- All instants are stored in UTC (`DATETIME`); calendar fields are `DATE`; the business timezone (default `America/Toronto`) is applied only when turning instants into business days.
- JSON columns hold lists (client emails, privileges, checklist) and audit snapshots.

**Stack:** Next.js 16.4 (Turbopack), React 19.3, TypeScript 5, Tailwind v4 (preflight only; styling is hand-written CSS in `src/app/globals.css`), mysql2, nodemailer, lucide-react icons, mammoth (Word preview). Dev dependency for tests: selenium-webdriver 4.51.

**Build output:** `next.config.ts` sets `output: "standalone"` (traced server + `node_modules` under `.next/standalone`) and lists `mysql2` in `serverExternalPackages` so the driver stays a plain Node package; the production image therefore also runs `scripts/*.mjs`. Cache Components and partial prefetching are enabled; the single page `/` prerenders as a static shell and every API route is dynamic.

---

## 2. Configuration and setup

### 2.1 Environment variables (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` | yes | Runtime database account (written by `npm run db:user:create`) |
| `USER_MANAGEMENT_KEY` | first run | Bootstrap key for the first administrator (AUTH-01) |
| `APP_URL` | behind a proxy | Public origin; used for the same-origin check and reset links. An `http://` value turns off the Secure cookie flag (plain-http deployments, the e2e stack) |
| `TRUSTED_ORIGINS` | optional | Extra allowed origins, comma separated |
| `BUSINESS_TIMEZONE` | optional | IANA zone, default `America/Toronto` (BR-12) |
| `ATTACHMENT_DIR` | optional | Attachment root, default `./storage/attachments` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | for email | Mailer; absent → email features report "not configured" |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `GOOGLE_REDIRECT_URI` | for Gmail | OAuth client for Gmail linking (MAIL-01); the token key encrypts stored refresh tokens; redirect defaults to `APP_URL/api/gmail/callback`. Absent → the Emails tab reports "not configured" |

`.env.setup.local` (administrator credentials, optional `MYSQL_APP_USER` and `MYSQL_APP_USER_HOST`) is used only by the setup scripts and never by the app. In Docker the `setup` service passes the same variables as environment and does not need the file.

### 2.2 Scripts

| Command | Script | Behaviour |
|---|---|---|
| `npm run db:create` | `scripts/create-database.mjs` | Creates the database, then applies numbered migrations recorded in `schema_migrations`. Migration 1 creates all tables, upgrades a prototype `users` table in place (adds columns, remaps roles), renames a prototype `leads` table to `legacy_leads`, and seeds list values, target templates, and settings. Idempotent. |
| `npm run db:user:create` | `scripts/create-app-user.mjs` | Creates `salestrackpro_app` with DML-only grants, writes `.env.local` (mode 0600) including commented SMTP/APP_URL placeholders. The account host defaults to `MYSQL_HOST`; `MYSQL_APP_USER_HOST=%` allows connections from other hosts or containers. Re-running rotates the password and bootstrap key. |
| `npm run db:seed` | `scripts/seed-sample-data.mjs` | Requires an administrator. Creates demo users (two Sales Managers, one Recruiter, password `SalesTrackPro-demo-2026`), ten leads across states, activities, tasks. No-op when leads exist. |
| `npm run dev` / `build` / `start` | Next.js | Development server / production build / production server |
| `npm run lint` / `typecheck` | ESLint (next/core-web-vitals + typescript + react-hooks) / `tsc --noEmit` | |
| `npm run test:e2e` | `tests/e2e/*.test.mjs` | Selenium suite via `node --test` (sequential, 120 s per test). Targets `E2E_BASE_URL` (default `http://app-test:3000`) and `E2E_SELENIUM_URL` (default `http://selenium:4444`). |
| `scripts/e2e.sh [files]` | compose profile `test` | Recreates the throwaway test database, builds the production image and the dev image, runs the suite, removes the test containers. Finds the Docker Desktop CLI on macOS when `docker` is not on PATH. |
| `scripts/docker-entrypoint.sh` | dev container | Runs `npm ci` into the `node_modules` volume when `package-lock.json` differs from the installed stamp, then execs the command. |

### 2.3 Containers

`Dockerfile` (base `node:22-bookworm-slim`) has two targets: `dev` (dependencies in the image, project bind-mounted at `/app`, `next dev`) and `runner` (standalone output, `.next/static`, `public/`, `scripts/`, user `node`, `node server.js` on port 3000). `.dockerignore` keeps `node_modules`, `.next`, `storage`, `.env*`, `docs`, and `tests` out of the build context.

| Service (`compose.yaml`) | Image | Role |
|---|---|---|
| `db` | `mysql:8.4` | Development database, volume `mysql_data`, published on `127.0.0.1:${DB_PORT:-3307}`, root password `${MYSQL_ROOT_PASSWORD:-salestrackpro}` |
| `app` | `salestrackpro-dev` (target `dev`) | Dev server on `${APP_PORT:-3000}`; volumes `node_modules` and `next_cache` shadow the host directories |
| `setup` (profile `setup`) | `salestrackpro-dev` | One shot: `create-database.mjs` + `create-app-user.mjs` as root with `MYSQL_APP_USER_HOST=%`; writes `.env.local` with `MYSQL_HOST=db` into the bind mount |
| `db-test` (profile `test`) | `mysql:8.4` | Throwaway database on tmpfs, root password `test`, not published |
| `app-test` (profile `test`) | `salestrackpro` (target `runner`) | Applies migrations then serves the production build; `APP_URL=http://app-test:3000`, `USER_MANAGEMENT_KEY=e2e-user-management-key`; healthcheck on `/api/auth/session` |
| `selenium` (profile `test`) | `selenium/standalone-chromium:4` | Chromium grid, 2 GB shm, 1600×1200 screen, noVNC on `127.0.0.1:7900` |
| `e2e` (profile `test`) | `salestrackpro-dev` | Runs `npm run test:e2e` once `app-test` is healthy |

`compose.prod.yaml` overrides `app` with the `runner` target, `env_file: .env.local`, an `attachments` volume at `/app/storage/attachments`, `restart: unless-stopped`, and removes the database port; it requires `MYSQL_ROOT_PASSWORD` in `.env`.

---

## 3. Data model

ER summary: `users` own `leads`; `leads` have many `lead_activities`, `tasks`, `lead_attachments`; `list_values` are referenced by seven lead columns; `target_templates` are referenced by `users`; `audit_log` references everything loosely by `(entity_type, entity_id)`.

All tables: InnoDB, utf8mb4, `utf8mb4_unicode_ci`.

### 3.1 `users`

| Column | Type | Notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| first_name, last_name | VARCHAR(80) | |
| email | VARCHAR(254) UNIQUE | lower-cased |
| phone | VARCHAR(40) | |
| password_hash | VARCHAR(180) | `scrypt$<salt hex>$<key hex>` (16-byte salt, 64-byte key) |
| role | VARCHAR(40) | `admin` · `sales_manager` · `recruiter` (ROLE-01) |
| privileges | JSON | **extra** privileges beyond the role defaults (ROLE-03) |
| stage | VARCHAR(30) | `onboarding` · `training` · `full_productive` (TGT-04) |
| is_active | BOOLEAN | false after termination |
| terminated_at | DATETIME NULL | |
| two_factor_enabled, auto_logout_enabled | BOOLEAN | AUTH-06, AUTH-07 |
| auto_logout_time | CHAR(5) DEFAULT '23:00' | AUTH-07: daily sign-out time `HH:MM` in the business timezone (migration 2) |
| target_template_id | INT UNSIGNED NULL FK → target_templates (SET NULL) | explicit assignment; otherwise stage default |
| created_at, updated_at | TIMESTAMP | |

### 3.2 `user_sessions`

id BIGINT PK · user_id FK (CASCADE) · token_hash CHAR(64) UNIQUE (SHA-256 of the cookie token) · expires_at DATETIME (8 h) · created_at. Index on expires_at.

### 3.3 `login_history` (AUTH-09, AUTH-11)

id · user_id NULL · email · succeeded BOOLEAN · ip_address VARCHAR(64) · user_agent VARCHAR(255) · created_at. Indexes on (email, created_at), (ip_address, created_at), (user_id, created_at). Also the rate-limit store.

### 3.4 `email_tokens` (AUTH-05, AUTH-06)

id · user_id FK · purpose `password_reset` | `two_factor` · token_hash CHAR(64) (hash of the link token or the 6-digit code) · challenge_hash CHAR(64) NULL (hash of the 2FA cookie value) · attempts INT · expires_at · consumed_at NULL · created_at.

### 3.5 `list_values` (LOV-*)

id · list_key VARCHAR(40) (`lead_type`, `status`, `bd_action`, `client_response`, `lead_category`, `company_size`, `city`) · code VARCHAR(60) (stable slug; `cold/warm/hot/client` are relied on by code) · value VARCHAR(120) (display, renamable) · sort_order INT · is_active BOOLEAN · timestamps. Unique (list_key, code) and (list_key, value).

### 3.6 `leads` (LEAD-01)

| Column | Type | BRD field |
|---|---|---|
| id | INT UNSIGNED PK | |
| owner_id | FK users | 2 Owner (OWN-01) |
| created_by | FK users | |
| lead_type_id | FK list_values | 1 |
| status_id | FK list_values | 7 |
| bd_action_id, client_response_id, lead_category_id, company_size_id, city_id | FK list_values NULL (SET NULL) | 5, 6, 21, 22, 10 |
| client_name | VARCHAR(200) | 4 |
| company_url | VARCHAR(2048) | LEAD-02 |
| address | VARCHAR(500) | 8 |
| comments | TEXT NULL | 9 |
| client_executive | VARCHAR(160) | 12 |
| contact_phone, contact_alt_phone | VARCHAR(40) | 13, 14 |
| contact_remark | VARCHAR(500) | 15 |
| client_emails | JSON (string array) | 16 |
| industry | VARCHAR(120) | 17 |
| positions | TEXT NULL | 18 |
| first_contact_date | DATE | 3 |
| follow_up_date | DATE NULL | 11 |
| contract_signed_date | DATE NULL | 19 |
| record_state | ENUM active/queued/archived | QUE-*, SRCH-05 |
| state_reason | VARCHAR(500) NULL | archive reason or "Rejected: …" |
| state_changed_by, state_changed_at | | |
| last_activity_at | DATETIME | NAV-03 sort key; bumped by every timeline entry |
| created_at, updated_at | | |

Indexes: (record_state, last_activity_at), (owner_id, record_state), status_id, follow_up_date, first_contact_date, created_at.

### 3.7 `lead_activities` (NOTE-01, NOTE-06, AC-02)

id BIGINT · lead_id FK (CASCADE) · user_id FK · activity_type VARCHAR(30) · summary VARCHAR(500) · body TEXT NULL (note text) · value_code VARCHAR(60) NULL (e.g. status code `client` for conversions, BD action code) · meta JSON NULL · occurred_at DATETIME (user-supplied, not in the future) · created_at.

Activity types: `created`, `call`, `email`, `visit`, `note`, `status_change`, `bd_action`, `client_response`, `follow_up`, `transfer`, `state_change`, `task`, `file`, `edit`. The first five are user-logged; the rest are system-generated.

### 3.8 `tasks` (TASK-02)

id BIGINT · lead_id NULL FK (CASCADE) · title VARCHAR(200) · description TEXT · assignee_id FK · creator_id FK · due_at DATETIME NULL · priority low/normal/medium/high · status open/done · checklist JSON `[{text, done}]` · completed_at · created_at, updated_at. Indexes on (assignee_id, status, due_at), lead_id, (creator_id, created_at).

### 3.9 `lead_attachments` (FILE-*)

id BIGINT · lead_id FK (CASCADE) · uploaded_by FK · category `document` | `profile` · label VARCHAR(120) (JD, Agreement, …, candidate name) · file_name VARCHAR(255) · mime_type · size_bytes · storage_key VARCHAR(255) (relative path under ATTACHMENT_DIR) · version INT · replaces_id NULL (previous version) · deleted_at, deleted_by NULL (soft delete) · created_at.

### 3.10 `audit_log` (AUD-*)

id BIGINT · actor_id NULL · action VARCHAR(60) · entity_type VARCHAR(40) (`lead`, `user`, `task`, `attachment`, `list_value`, `target_template`, `setting`, `session`) · entity_id NULL · before_json, after_json JSON NULL (only changed keys for updates) · details VARCHAR(500) · created_at. Indexes on (entity_type, entity_id, created_at), (actor_id, created_at), created_at.

Action catalogue: `user.created/updated/password_changed/terminated/target_assigned`, `lead.created/queued/updated/transferred/reassigned/approved/rejected/archived/restored/call_logged/email_logged/visit_logged/note_logged`, `task.created/updated/completed`, `attachment.uploaded/replaced/deleted`, `list_value.created/renamed/updated/reordered`, `target_template.created/updated`, `setting.updated`, `seed.sample_data`.

### 3.11 `target_templates` (TGT-*)

id · name VARCHAR(80) UNIQUE · stage · daily_leads · weekly_leads · daily_visits · weekly_visits · monthly_conversions · timestamps. Seeded: Onboarding (2/10/1/4/1), Training (3/15/2/8/2), Full Productive (5/25/3/12/4).

### 3.12 `app_settings`

setting_key PK · value_json. Keys: `role_labels` `{admin, sales_manager, recruiter}` (ROLE-02), `reminders` `{inactivityDays}` (TASK-05), `business_calendar` `{holidays: [{date, name}]}` sorted by date (RPT-03, TASK-03).

### 3.13 `schema_migrations`

version PK · name · applied_at. Versions: 1 core schema; 2 `users.auto_logout_time` and the `business_calendar` setting; 3 `gmail_connections`.

### 3.14 `gmail_connections` (MAIL-01)

user_id PK FK → users (CASCADE) · google_email VARCHAR(254) · refresh_token_encrypted TEXT (AES-256-GCM under SHA-256(`GMAIL_TOKEN_KEY`), stored as `iv.tag.ciphertext` base64) · created_at · updated_at. One link per user; reconnecting replaces it.

---

## 4. Authentication and session design

| Topic | Design |
|---|---|
| Password hashing | Node `scrypt`, 16-byte random salt, 64-byte key, constant-time compare. Unknown accounts hash a dummy value so timing does not reveal existence (AUTH-01). |
| Session | 32 random bytes (base64url) in cookie `salestrackpro_session` (httpOnly, SameSite=Lax, Secure in production unless `APP_URL` is `http://`, 8 h). Only the SHA-256 hash is stored. Sessions are deleted on sign-out, password change (other sessions), termination, and deactivation. |
| Auto sign-out (AUTH-07) | On every request, if the account has `auto_logout_enabled` and the session was created before the latest occurrence of the account's `auto_logout_time` (default 23:00) in the business timezone, the session is deleted and the request is treated as signed out. |
| Two-factor (AUTH-06) | Password OK + `two_factor_enabled` → create `email_tokens` row (purpose `two_factor`, hash of a 6-digit code, hash of a random challenge), set cookie `salestrackpro_2fa` (10 min), email the code, respond `{requiresTwoFactor:true}`. `POST /api/auth/two-factor` matches cookie + code, max 5 attempts, then creates the session and clears the challenge cookie. Requires SMTP; sign-in explains when it is missing. |
| Password reset (AUTH-05) | `POST /api/auth/forgot-password` always returns 200 when SMTP exists (503 "not configured" otherwise); creates a 30-minute token (max 3 per 15 min per user) and emails `${APP_URL}/?reset=<token>`. The SPA reads `?reset=`, shows the reset form, and calls `POST /api/auth/reset-password`, which consumes the token and revokes all sessions. Admins can trigger the same email per user (invitation). |
| Rate limiting (AUTH-11) | `login_history` counts failures in the last 15 minutes: ≥10 per email or ≥50 per address → 429. Works across instances and restarts. |
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
| log_activities | ✓ | ✓ | | Calls, emails, visits |
| manage_tasks | ✓ | ✓ | | Create; update own/assigned tasks |
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

All endpoints return JSON; errors are `{ "error": string }` with status 400 (validation), 401 (not signed in), 403 (forbidden/origin), 404, 409 (duplicate), 429 (rate limit), 503 (database or mailer unavailable). State-changing methods require the `Origin` header (§4).

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
| `GET /api/settings` | session | `{ settings, mailerConfigured, timeZone }` |
| `PATCH /api/settings` | manage_settings | `{ roleLabels?, reminders?, holidays? [{date, name}] }` → `{ settings }` (holidays: valid dates, names ≤ 80 characters, ≤ 400 entries, duplicates collapse) |

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
| `GET /api/dashboard?scope=mine\|team` | session | `{ today, metrics {calls,emails,visits: {thisWeek,lastWeek}}, followUps {overdue,today,tomorrow}, targets, inactiveLeads, inactivityDays, openTasks, overdueTaskCount, recentLeads, teamWide }` |
| `GET /api/reports?period=&userId=` | view_reports | `{ range, rows: PerformanceRow[], series: daily points }` |
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

Calls/emails/visits = counts of user-logged activities by type for this week and last week (own, or whole team for admins). Follow-ups = active leads by `follow_up_date` (< today, = today, = tomorrow). Needs attention = active leads with `last_activity_at` older than `inactivityDays`. Open tasks = assignee's open tasks (overdue count by `due_at`). Recent leads = active leads by `last_activity_at`.

---

### 7.10 Natural-language dates (TASK-03, NOTE-05)

`src/lib/natural-dates.ts` is a dependency-free parser shared by the browser (live preview) and `tests/unit`. `parseNaturalDate(text, { anchor, holidays })` finds the earliest date phrase (a phrase inside a longer one, such as "Feb" inside "Feb 1", is ignored) and resolves it against the anchor calendar date: relative words (today, tomorrow, day after tomorrow, next week/month/quarter/year, end of week/month/year), weekday names, periods ("in two weeks", "six months", "3 business days"), month names alone (first working day of the next such month, year included when given), and explicit dates in several spellings (`Feb 1`, `1st of February 2027`, `Feb/01/2027`, `02/01/2027` month first, `2027-02-01`). Working day = Monday to Friday minus the `business_calendar` holidays. Relative results and month names roll forward to the next working day and report `adjusted`; weekday names move only when they hit a holiday; explicit dates are kept as written. A time of day (`at 10am`, `3:30 pm`, `at 3` = 15:00, `14:45`, noon, morning 09:00, afternoon 14:00, evening 17:00, end of day 17:00) is read from the remaining text.

Client use: `features/tasks/NaturalDateField` shows "Understood “…” as <date> at <time>" and fills the date/time inputs, which stay editable (the confirmation step). It appears in `TaskFormDialog` and in the lead follow-up scheduler. `suggestFollowUp(text, { anchor, today, holidays, person, company })` (NOTE-05) additionally requires a next-step cue in the sentence holding the date (strong: follow up, call back, check in, reach out, touch base, remind, revisit, next step, schedule…; weak: will, need to, should, by, before, due, meet, send… unless the sentence also has a past-tense cue) and a date not before today. The note form uses the interaction date as the anchor, shows the offer with an editable title, date, and time, and sends `followUpTask` with the activity when the offer stays ticked.

## 8. Client application design

### 8.1 Shell

- `src/app/page.tsx` renders `App`: checks `/api/auth/session`; shows `AuthScreen` (login, 2FA code, forgot, reset, first-time setup) or `AppShell`.
- `AppShell` loads `/api/reference` once, provides `AppContext` (`user`, `reference`, `notify`, `navigate`, `openLead`, `openNewLead`, `can`, `roleLabel`, `dataVersion/bumpData`), renders the sidebar (items filtered by privilege, counts for queued leads and open tasks), topbar (global lead search, profile menu), the current view, the lead detail dialog, the new-lead dialog, and toasts.
- Routing: URL hash `#/<view>[/<param>][?query]` (`useHashRoute`). Views: `home`, `leads`, `all-leads`, `cold`, `warm`, `hot`, `client`, `queued`, `archive`, `lead/<id>`, `tasks[/<id>]`, `reports`, `targets`, `admin`, `values`, `settings`, `devices`, `lead-generation`, `planner`. Lead lists are keyed by view + query so navigation resets filters.
- Data loading: `useAsyncData(fetcher, refreshKey)` — memoized fetcher, derived `loading`, `reload()`, no synchronous state writes inside effects (satisfies the React Compiler lint rules). After any mutation, `bumpData()` refreshes lists and counts.
- Permissions in the UI mirror the server: buttons and navigation items render only when `can(privilege)`; the server remains authoritative.

### 8.2 Feature modules

| Folder | Components |
|---|---|
| `features/auth` | `AuthScreen`, `ChangePasswordDialog` |
| `features/dashboard` | `ActionCenter` |
| `features/gmail` | `LeadEmails` (Emails tab: configuration note, connect/disconnect, recent messages), `client.ts`, server `gmail.ts` (OAuth exchange, token encryption, Gmail search) |
| `features/leads` | `LeadListPage` (toolbar, filters panel, bulk bar, pagination), `LeadTable`, `LeadFormDialog` (all fields), `LeadDetailDialog` (Overview, Timeline, Emails, Documents, Profiles shared, Tasks, Audit tabs; transfer, archive/restore, approve/reject, schedule follow-up, quick BD action/response/status updates) |
| `features/tasks` | `TasksPage` (Overdue / Today / Upcoming / Done columns, mine/team), `TaskFormDialog` (lead search, assignee, typed or picked due date, priority, checklist), `NaturalDateField` (TASK-03 preview) |
| `features/reports` | `ReportsPage` (period chips, user filter, stat tiles, daily stacked bars, performance table with drill-down dialog, CSV export) |
| `features/admin` | `AdminPage` router, `UsersPanel` (+ `UserFormDialog`, password dialog, terminate dialog, login history), `ListValuesPanel`, `TargetsPanel`, `SettingsPanel` (role names, reminder days, business-calendar holidays), device placeholder |
| `features/users` | `UserDirectoryDialog` (person picker) |
| `features/preview` | `LeadGenerationPage`, `PlannerPage` (labelled previews) |
| `features/shell` | `App`, `AppShell`, `AppContext`, shared `Dialog`, `Tabs`, `Field`, `Pagination`, `PromptDialog`, `Avatar`, `StatusPill`, `EmptyState` |

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

### A5. Lead Detail / 360° View — implemented (AI summary, Email, Collaboration tabs planned)

```
| ACME CO  [Hot] [Owner: Sara] [Transfer]      |
| AI SUMMARY: Email | Interactions | Next Action|
| Tabs: Overview | Timeline | Email | Files     |
|       Profiles | Tasks | Collaboration | Audit|
| Latest interactions (newest first)            |
| [Add Note] [Mic] [Message @user/@all...]      |
```
As built tabs: Overview, Timeline (log call/email/visit, add note), Emails (Gmail, A6), Documents, Profiles shared, Tasks, Audit (admins). Header actions: Edit, Transfer, Approve/Reject, Archive/Restore; status select in the header.

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

### A7. Collaboration / Tasks — tasks implemented, collaboration planned (§10.3)

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
As built: the Tasks page (Overdue / Today / Upcoming / Done) and the Tasks tab on a lead implement the lower half, including assignee, due date and time, priority, and checklist.

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
As built: seven period chips, person filter, stat tiles, daily stacked bars, table with Leads, Updated, Calls, Emails, Visits, Notes, Conv., Tasks, Done, Files, Logins, Target %; numbers drill down; CSV export. Lead-generation report and PDF export planned.

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

---

## 10. Designs for planned features

### 10.1 Google sign-in (AUTH-03)
OAuth 2.0 authorization-code flow with PKCE via a `/api/auth/google` start and `/api/auth/google/callback` route. Match the verified Google email to an active `users` row (no auto-provisioning, per AUTH-01), then create the normal session. Store the Google subject id in a new `user_identities(user_id, provider, subject)` table.

### 10.2 Gmail integration (MAIL-*)
As built (first cut, §6.8): per-user read-only Gmail link with the refresh token encrypted in `gmail_connections`; the Emails tab queries Gmail live for the lead's client addresses and lists the newest messages with body text. Still planned, as designed below: stored threads, owner-mailbox association on transfer, reply/forward, attachments, and summaries.

Target design: per-user mailbox authorization (Gmail API `readonly` + `send` scopes) with refresh tokens in `mailbox_connections`. A background sync (cron or queue) pulls messages whose participants match a lead's `client_emails` and stores headers/bodies in `lead_emails` (lead_id, message_id, thread_id, direction, from, to, subject, snippet, body, sent_at) and attachments metadata. Ownership change switches the mailbox used for future association; history stays. The Email tab renders threads; reply/forward call the Gmail send API. AI summaries (email and interaction) are generated by an LLM over the thread and timeline, cached in `lead_summaries` with a hash of the inputs and refreshed when inputs change.

### 10.3 Collaboration and notifications (COLL-*, NTF-*)
`lead_messages` (lead_id, parent_id, author_id, body_rich, edited_at, deleted_at) with mention parsing into `message_mentions`. A `notifications` table (user_id, type, entity, read_at) fed by the same events that already write `audit_log`; delivery workers send email (existing mailer) and push (FCM/APNs) by preference. Real-time via Server-Sent Events from `/api/events` (presence and typing use short-lived rows keyed by lead).

### 10.4 Lead generation (LGEN-*)
A `lead_generation_results` table (user_id, company, url, radius_km, payload JSON, created_at). Providers behind an interface: job sources (Indeed API or careers-page scraping where permitted), review sources (Google Places), company data, and an LLM for the approach and introduction email. Results convert to leads via the existing `POST /api/leads`.

### 10.5 Road visit planner (PLAN-*)
`road_visits` (user_id, date) and `road_visit_stops` (visit_id, lead_id or company, address, sequence, planned_at). Optimization through a routing API (Google Routes or OSRM) with a fixed 30-minute break near 13:30. Completed stops log a `visit` activity, which already feeds targets and reports.

### 10.6 Device authorization (AUTH-08..10)
`devices` (id, user_id, identifier, type, label, first_seen, last_seen, status) with the identifier coming from an MDM/managed-browser header or a native app. Login records the device; a policy flag per user refuses unknown devices. Admin screen A12 manages status.

### 10.7 Rich text, voice, OCR (NOTE-03, NOTE-04, OCR-*)
Store notes as sanitized HTML from a constrained editor (bold, italic, lists, links). Voice via the Web Speech API on desktop/Android and native dictation on iOS, editable before save; the transcript feeds the same follow-up suggestion as typed notes (§7.10). OCR via a vision API with a review form before populating the lead.

---

## 11. Security and deployment notes

- Run behind TLS; set `APP_URL` so the origin check and reset links use the public host. An `http://` `APP_URL` turns off the Secure cookie flag for deployments without TLS (internal hosts, the end-to-end stack); browsers drop Secure cookies over plain http on anything but localhost.
- The app database account has no DDL rights; schema changes go through `npm run db:create`.
- Attachments live outside the web root; downloads set `Content-Disposition`, `X-Content-Type-Options: nosniff`, and a sandboxing CSP.
- Session, reset, and 2FA secrets are stored only as hashes; cookies are httpOnly and SameSite=Lax.
- Error responses never include SQL or stack details; failures are logged server-side with context.
- Sign-in, reset, and 2FA attempts are rate limited in the database.

---

## 12. Verification

- `npm run typecheck`, `npm run lint`, `npm run build` must pass.
- Unit tests (`tests/unit`, `node:test` on Node 22 type stripping, `npm run test:unit`): the natural-language date parser (working days, relative phrases, weekday names, periods, month names, explicit spellings, times of day) and the note follow-up suggestion rules.
- End-to-end API suite (kept outside the repo during development) covers: first-run setup, bootstrap key lock-out, login and origin checks, seeding, reference data, role permissions for every mutating endpoint, queued review, edit/transfer rules, activities, lead 360 and audit visibility, tasks and checklists, uploads with versioning and type rejection, downloads, soft delete, dashboard, team and own reports, all periods, drill-down, list-value rename propagation and inactive-value rejection, settings, templates and assignment, user updates with extra privileges, bulk archive/restore/reassign, login history, admin and self password changes, SMTP-missing responses, termination cascade and session revocation, last-admin guard, audit action coverage, rate limiting, sign-out.
- Browser end-to-end suite (`tests/e2e`, Selenium + `node:test`, run with `scripts/e2e.sh` against a production build, an in-memory MySQL, and a Chromium grid in Docker): first-time setup, sign-in, password change and reset messaging, lead life cycle (create, BD action, timeline, note that offers a follow-up task, Emails tab without Gmail configured, follow-up task, document upload, edit, status, search, archive/restore), tasks (including a due date typed in words), user creation, a per-account sign-out time ending an older session, role-limited navigation, queued-lead approval, transfer, termination hand-off, list of values, settings, business-calendar holiday, target templates, report drill-down.
