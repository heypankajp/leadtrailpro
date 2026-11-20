# LeadTrailPro — Technical Specification (SPEC)

| | |
|---|---|
| Source | `Sales_Tracker_App_BRD_SRS.docx` v1.0 (October 13, 2026) and its updated PDF of October 19, 2026 (adds BRD §25, PRD §3.23), the change note `SalesTrackPro_Sales_Trip_Planner_Requirement_Change.docx` (October 21, 2026, local and untracked), and the current codebase |
| SPEC version | 1.38 — November 19, 2026 (late): Lead Generation apart from Leads, Lead Discovery, the Preview menu section (§10.27, PD-69). 1.37 — November 19, 2026 (late): clients apart from the pipeline, + Client, the Closed Date, contracts (§10.26, PD-66..68; migration 41; attachment category `contract`). 1.36 — November 19, 2026 (night): leads added by hand, the lead's own fields and company and contacts, BD action and Client response off the deal, Lead Gen Tool, nested Add company / Add contact dialogs, the deal Summary and the Client confirmation (§10.25, PD-59..65; migrations 38 to 40; `POST /api/opportunities`, `PATCH /api/opportunities/{id}` action `edit`, §6.13). 1.35 — November 19, 2026 (evening): Add company → Website → Fetch (§10.24, PD-58; `POST /api/contacts/organizations/lookup`, §6.17). 1.34 — November 19, 2026 (later): Move to stage in the card menu again, Quick filters, one Schedule an Activity dialog (§10.23, PD-55..57). 1.33 — November 19, 2026: an organization is called a Company in everything a person reads (§10.22, PD-54); the check after the review of November 18 (stale browser tests, the deal page's activity form, panel spacing); `docs/SETUP.md`. 1.32 — November 18, 2026: the review of November 18 (§10.21, PRD §3.28, PD-31..53), built and released the same day: the add-deal stage arrows (`StagePicker`), contacts looked up inside the company, the card menu with Convert to Client, the Archival reason (migration 30, `leads.archive_reason_id`), the Clients entry, the To Do page on Everyone, the quarters and Followup in the Filter menu, Sales Trips (migration 31, `visit_trips`, `visit_trip_deals`, `/api/visit-trips`), Recent Planned Trips in the planner, the By Period calendar (`DateRangePicker`), Title Case menu; data model §3.27, API §6.4 and §6.18. 1.31 — November 16, 2026 (night): the rest of §10.20 built: adding a deal from a stage (the "…" column menu, the always-visible "+", no "+ Deal" on the boards), the Schedule an activity form with types, a time slot, priority, Mark as done and the day's agenda (migration 29), and the Filter menu with ready-made and data cleanup filters (`quick` on `/api/pipeline` and `/api/leads`). 1.30 — November 16, 2026 (evening): §10.20 for the second and third comment files: "Deal type" is called Deal source and gains Referral (migration 28; the Insights filter for the leads inbox is now Origin); adding a deal from a stage, the Schedule an activity form and the data cleanup filters are planned. 1.29 — November 16, 2026 (later): §10.19 built the same day (as-built notes at its end): migration 27, `/api/pipeline/stages`, the `manage_stages` privilege, `groupBy=status` and the date filter on `/api/pipeline`, 409 `confirm_create` on new deals and contacts, company-wide emails. 1.28 — November 16, 2026: the colleague's comments on the live version designed, nothing built (§10.19): the add-deal dialog starts from a company picked as you type, and a new company or contact is created only after a confirmation; "Person" becomes "Contact" and every contact belongs to a company (migration 27); a deal's emails cover every contact of its company; the board uses the whole window with a visible scrollbar; Sales Managers rename, add, reorder and delete stages (`manage_stages`); one actions menu on a card (move, follow-up, To Do list, archive) instead of the stage arrows and the next-step mark; a date filter and a board by status; the composer's Emails tab; the menu entry "Pipeline". 1.27 — November 13, 2026 (night): deploys can be paused from the app or from another machine, so a push does not have to be a release (§2.4, §6.16). 1.26 — November 13, 2026 (evening): the rest of the new core short of Insights: optional deal value and expected close date with stage totals on the board (§10.15, migration 24); notes and logged calls on a contact itself, a person without deals filed under another company, merging duplicate people and companies with the earlier names kept for the import (§10.16, migration 25); the contacts timeline (§10.17); several pipelines, each with its own stages and board (§10.18, migration 26); the next-step prompt opens once with the saved deal. 1.25 — November 13, 2026 (later): contacts as records, so work can start from a contact (§10.14): tables `organizations` and `persons`, every deal linked to both (migration 23), People and Companies added before any deal, their pages with "+ Deal", several deals per company, edits on a contact reaching its deals, the import and the sample data keeping the links (§3.25, §6.17). 1.24 — November 13, 2026: the standard CRM layout taken as the base, step 1 (§10.13): its names (the records called leads are now **deals**, the opportunity pool is now **Leads**) in everything a person reads, the new menu and top bar with quick add, the Deals page with its view switch, the deal page in place of the lead dialog, the two-column add-deal dialog, Contacts (People and Companies read from the deals, §6.17), old addresses kept as aliases, migration 22. Sections written before this date still say "lead" for a deal and "opportunity" for a lead; code, tables, API paths and requirement IDs keep the old names. 1.23 — November 12, 2026 (evening): To Do lists built (TODO-01..05): lists an administrator defines, "To be visited" first, on which a salesperson puts a lead by hand and takes it off by hand; the To Do page, the control on the lead page, the bulk move, the filter, migration 21 (§3.1, §6.4, §10.12, §12). 1.22 — November 12, 2026 (later): KPI report emails reworked after the first real ones: every report leads with where each person's leads stand when it is sent (leads by status per Sales Manager, what is waiting, totals over every lead), the daily report carries no period numbers, the weekly and monthly ones add the period's activity for the people who recorded something (§7.18, §12); leads from the tracker import are credited to their Sales Manager, not to the administrator who ran the import (`created_by`, migration 20, §10.9); releases and data corrections without a shell on the server: the `migrate` and `deployer` services, the deploy status and request API, and `POST /api/admin/sql` (§2.1 to §2.4, §6.16, §11, §12). 1.21 — November 12, 2026: Pipeline board Phase 3 built (PIPE-11 complete, PIPE-12): the stage bar on the lead page, bulk move from the lead lists (`POST /api/leads/bulk` action `stage`), Analytics by stage (pipeline by stage with drill-down, stage over time, time in stage, stage moves) and the KPI emails' pipeline by stage (§6.4, §6.14, §8.2, §10.11 as-built note, §12). 1.20 — November 12, 2026 (early): Pipeline board Phase 2 built (PIPE-08..10): needs-attention rules by stage with migration 19 seeding the proposed days, the `pipeline` setting (per-stage next step, prompt and auto switches), the next-step prompt after activities, BD actions, and moves, automatic stage follow-ups, the No next step panel and digest line (§3.12, §3.13, §6.2, §6.4, §6.6, §7.9, §7.11, §8.2, §10.11 as-built note, §12). 1.19 — November 11, 2026 (night): Pipeline board Phase 1 built (PIPE-01..07, PIPE-11 in part; migration 18: the `stage` list, `leads.stage_id`, `list_values.stage_id`; `stage_change` entries; `GET /api/pipeline`, `PATCH /api/leads/{id}/stage`, `POST /api/pipeline/recompute`; §3.5–3.7, §3.13, §6.4, §6.15, §8.2, §10.11 as-built note, §12). 1.18 — November 11, 2026: pipeline board and stages designed after the project owner's trial of a commercial CRM, the decisions recorded, nothing built (§10.11; PRD §3.24 and open question 16). 1.17 — November 10, 2026 (night): a company whose tracker rows name no Sales Manager goes to the opportunity pool as a card carrying its drafted lead and timeline (`opportunities.draft`, migration 17); Assign as lead pre-fills the form from the draft, creates the lead without the historical-date queue, and writes the rows to its timeline; a later export that names a manager, or a lead created by hand, turns the card into that lead (§3.22, §6.13, §7.14, §10.9, §12); KPI report emails to administrators, daily, weekly, and monthly, with the switches under Settings → Email delivery and send-now buttons (`email.kpiReports`, `runKpiReports`, audit `report.kpi`; §6.10, §7.18, §12). 1.16 — November 10, 2026 (later that day): personal access tokens (`api_tokens`, migration 16; Administration → API access; `Authorization: Bearer ltp_…` accepted on every endpoint, the origin check waived for token requests; §3.24, §4, §6.1, §6.7, §8.2) and the tracker import through the app (`GET`/`POST /api/imports/tracker`, Administration → Tracker import with preview and apply, the rules moved to `scripts/lib/tracker-import.mjs` and shared with the command line, `scripts/ltp.mjs` / `npm run remote` as the client from another machine; §2.2, §6.7, §10.9, §12). 1.15 — November 10, 2026: tracker import made incremental and limited to the `LeadsDec25` sheet: row fingerprints on timeline entries, edited rows updated in place, leads refreshed from the sheet, `--baseline` once for a database filled before fingerprints, `--archive-sheet` / `--clients-sheet` opt-in (§10.9, §12). 1.14 — November 7, 2026: mailbox watch (MAIL-01): every five minutes the scheduler scans each connected Gmail mailbox, stores mail exchanged with a lead's client addresses in `lead_emails`, stamps `leads.last_client_email_at` / `last_team_email_at`, flags leads awaiting a reply on the Action Center, lead list (sort "Client's last email"), lead page, and daily digest, and notifies the owner (`email_received`); Settings → Email delivery switch; `GMAIL_API_URI` stand-in; migration 14 (§3.23, §7.11, §10.2, §12). Same day: opportunity searches hold a group of job titles (one Indeed OR query), one location, and a posted-within window, with defaults under Settings → Opportunity searches; `SearchListingsInput.postedWithinDays`; migration 15 (§3.22, §7.14). Team board on Analytics (`GET /api/analytics/team`, `/team/leads`; §6, §7.16) and client emails shared with colleagues through the mailbox watch's matches (§6.8). Job-source usage meter: credits per call, HasData's live balance, administrator alerts at the warning level and at 100%, the usage card on Opportunities and the planner (`GET /api/jobs/usage`; §7.13). 1.13 — November 6, 2026 (later that day): Google consent screen published, External and unverified, so no test users and no seven-day token expiry (§3 authentication table, §10.1); email through the Google app (`MAIL_PROVIDER=gmail`, sending mailbox and report-email switch in Settings, §7.17); Send email and Reply from a lead's Emails tab through the person's own mailbox (§6.8); password features off wherever a Google client exists, `users.password_hash` nullable, seed file without passwords (migration 12, §7.17); the Analytics screen with rolling and custom periods, lead filters, status charts, stalled leads, pool funnel, breakdowns, leaderboard, and the flag-guarded weekly report email (§6.14, §7.16); pool searches limited to chosen sources (Indeed by default); menu renamed Analytics, settings section Summary emails. 1.12 — November 6, 2026: opportunity pool built in the form the project owner chose (OPP-*: administrator-kept keyword searches on every job source, one card per company, assign-to-create-lead with the owner chosen, not-relevant reasons, listings attached to live leads, reopening of closed leads; §3.22, §6.13, §7.14, §10.10); duplicate guard on lead creation (§7.15); every Sales Manager may reassign any lead (§5); `searchListings` on every job-source adapter (§7.13); migration 11; tests (§12). 1.11 — November 5, 2026: Sign in with Google built (AUTH-03): one consent for identity and read-only Gmail (the project owner's decision), PKCE, one callback shared with Gmail linking, the verified Google email matched to an active account and nothing auto-created, Google-only sign-in wherever the client is configured (password form hidden, login API 403) (§3 authentication table, §2 routes and variables, §10.1); `exchangeCode` in `features/gmail/gmail.ts` shared by Gmail linking and sign-in; seed accounts file `seed/accounts.csv` with `npm run db:seed:users` and the setup service (§2); unit tests for both (§12). 1.10 — October 31, 2026: product renamed LeadTrailPro on October 30, 2026 (compose project, images, database defaults, cookie names, export file names, and mail wording; §2, §2.3, §4, §11), Next.js 16.4.3 security release with `experimental.agentUpgrade: "security"` (§1), root layout typed without the generated `LayoutProps` (§12), `npm run mail:test` and `npm run db:check` (§2; `nodemailer` added to `serverExternalPackages` so both run from the production image, §1), `.gitattributes` forcing LF on shell scripts (§2.3), the SMTP findings (§11), and `docs/TESTING.md` (set-up and test guide for a laptop or a server). Google trip adapter moved to Places API (New) and the Routes API with pure, unit-tested mappers and `npm run maps:test` (November 4, 2026; §10.8, §2, §12). Live job-source keys (November 1, 2026): Adzuna adapter switched to `what_phrase`, HasData `domain` expanded to the Indeed host, sample-first ordering with the stub trip provider, `npm run jobs:test` (§7.13, §2). 1.9 — October 26, 2026: job-listing sources layer as built (§7.13, §3.21). 1.8 — October 25, 2026: HasData Indeed API adapter design (§10.8, §10.10). 1.7 — October 25, 2026: shared rich-text editor with dictation (§7.12), task comments (§3.20, §6.12), CI workflow (§12). 1.6 — October 23, 2026: legacy tracker import as built (§10.9). 1.5 — October 22, 2026 (1.4: October 22, 2026; 1.3 and 1.2: October 21, 2026; 1.1: October 18, 2026; 1.0: October 17, 2026) |
| Changes in 1.4 | In-app notifications, preferences, digests, and the jobs scheduler (TASK-06, NTF-*: migration 7, §3.17–3.18, §6.10, §7.11, `scripts/jobs.mjs`, compose `jobs` service). Opportunity Recommendation design sketch (§10.10) for the updated BRD's §25. Mail provider switch with a stub outbox (`MAIL_PROVIDER`, migration 6, §3.16, §6.2). Needs-attention rules per status / BD action (TASK-05: `reminders.rules`, §3.12, §7.9), report stage and template filters (RPT-05, §6.6), PDF exports with `pdfkit` (RPT-06, `src/lib/pdf.ts`, §6.6, §6.9), axe-core accessibility audit in the browser suite (NFR-07, §12) |
| Changes in 1.3 | Sales Trip Planner built (TRIP-01..11: migration 5, provider interface with stub and Google adapters, lead matching, trips API §6.9, screen A16, Excel export) and report Excel export (RPT-06). Lead status reasons implemented (LEAD-06/07: migration 4, `status_reason_id`, reason lists, status prompt, filters). PostgreSQL replaces MySQL: `pg` driver and `?`→`$n` query layer (§1, §2), PG* settings and `postgres:17` containers (§2), identity columns, JSONB, TIMESTAMP(0) UTC and the updated_at trigger (§3), SQLSTATE error mapping (§6) |
| Changes in 1.2 | Sales Trip Planner design and screen A16 (§2.1, §8, §9, §10.8), lead status reasons (§3.5, §3.6, §3.13, §6.4, §7.1), legacy tracker import (§10.9) — from the change note of October 21, 2026 (PRD §3.22, LEAD-06/07) |
| Changes in 1.1 | Docker packaging (§2.3), Selenium end-to-end suite (§12), Secure-cookie rule for plain-http deployments (§4, §11), `mysql2` kept external in the standalone build (§1) |
| Companion | `PRD.md` — requirement IDs referenced here (AUTH-01, LEAD-01, …) |
| Product name | LeadTrailPro since October 30, 2026 (formerly SalesTrackPro; the BRD calls it the Sales Tracker App). The rename commit names the site leadtrail.pro |
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
   ├─ Google APIs (sign-in, Gmail, Maps) and job-listing sources (§7.13, §10.8)
   └─ Mail: the Gmail API (MAIL_PROVIDER=gmail, since November 6, 2026, §7.17), legacy SMTP (nodemailer), or the stub outbox (MAIL_PROVIDER=stub)
```

**Conventions**

- Feature folders: `model.ts` (shared types, validation, pure helpers; importable by the client), `repository.ts` (server-only SQL and business rules), `client.ts` (browser fetch wrappers), React components.
- All route handlers: validate origin for state changes → load the session user → check privilege → parse body → call repository → map errors with `handleRouteError` (which rethrows Next.js internal signals first).
- Every mutation runs in one transaction with its audit entry and timeline entry.
- All instants are stored in UTC as `TIMESTAMP(0)` text (`src/lib/db.ts` converts to and from ISO 8601); calendar fields are `DATE`; the business timezone (default `America/Toronto`) is applied only when turning instants into business days.
- JSONB columns hold lists (client emails, privileges, checklist) and audit snapshots.
- Repositories write SQL with `?` placeholders; `src/lib/db.ts` rewrites them to `$1 … $n`, returns `{ rows, rowCount }`, and inserts use `RETURNING id`. camelCase column aliases are double-quoted because PostgreSQL folds unquoted identifiers to lower case.

**Stack:** Next.js 16.4.3 (Turbopack; the security release of October 30, 2026, with `experimental.agentUpgrade: "security"` in `next.config.ts` so `next dev` and `next build` print a reminder, and stop a coding agent's run once, when a newer security release exists; it never upgrades by itself), React 19.3, TypeScript 5, Tailwind v4 (preflight only; styling is hand-written CSS in `src/app/globals.css`), pg, exceljs, pdfkit, nodemailer, lucide-react icons, recharts (Analytics/Insights charts, since November 6, 2026), mammoth (Word preview). Dev dependencies for tests: selenium-webdriver 4.51 and `@axe-core/webdriverjs` (NFR-07).

**Build output:** `next.config.ts` sets `output: "standalone"` (traced server + `node_modules` under `.next/standalone`) and lists `pg`, `exceljs`, `pdfkit`, and (since October 31, 2026) `nodemailer` in `serverExternalPackages` so they stay plain Node packages; the production image therefore also runs `scripts/*.mjs`. Cache Components and partial prefetching are enabled; the single page `/` prerenders as a static shell and every API route is dynamic.

---

## 2. Configuration and setup

### 2.1 Environment variables (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | yes | Runtime database role (written by `npm run db:user:create`); the database defaults to `leadtrailpro` |
| `USER_MANAGEMENT_KEY` | first run | Bootstrap key for the first administrator (AUTH-01) |
| `APP_URL` | behind a proxy | Public origin; used for the same-origin check and reset links. An `http://` value turns off the Secure cookie flag (plain-http deployments, the e2e stack) |
| `TRUSTED_ORIGINS` | optional | Extra allowed origins, comma separated |
| `ALLOWED_DEV_ORIGINS` | optional, dev server only | Extra hostnames for Next.js `allowedDevOrigins` when `next dev` is served through a public domain; `leadtrail.pro` and `www.leadtrail.pro` are built into `next.config.ts` (deployment feedback of November 5, 2026). Irrelevant to the standalone production build |
| `BUSINESS_TIMEZONE` | optional | IANA zone, default `America/Toronto` (BR-12) |
| `ATTACHMENT_DIR` | optional | Attachment root, default `./storage/attachments` |
| `MAIL_PROVIDER` | optional | `gmail` (the default when the Google client is configured) sends through the Gmail API from the mailbox chosen under Settings → Email delivery (`features/gmail/send.ts`); `stub` records every message in `mail_outbox` instead of sending; `smtp` (legacy) uses the SMTP_* settings; `off` disables email. With `gmail`, `isMailerConfigured()` is true only once a sending mailbox is chosen (`lib/mail-state.ts`, refreshed by every settings read and write) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | legacy | SMTP mailer, used only with `MAIL_PROVIDER=smtp`; retired on November 6, 2026 in favour of the Google app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `GOOGLE_REDIRECT_URI` | for Google | One OAuth client for Sign in with Google (AUTH-03) and Gmail linking (MAIL-01); the token key encrypts stored refresh tokens; the single redirect URI defaults to `APP_URL/api/auth/google/callback` (`googleRedirectUri()` in `features/users/google-signin.ts`). Without id and secret the sign-in button is hidden; without the token key the mailbox token is not stored and the Emails tab reports "not configured" |
| `GOOGLE_AUTH_URI`, `GOOGLE_TOKEN_URI`, `GOOGLE_PROJECT_ID` | optional | Overrides for Google's authorization and token endpoints (`googleEndpoints()` in `features/gmail/gmail.ts`, defaults `accounts.google.com/o/oauth2/v2/auth` and `oauth2.googleapis.com/token`) and the Cloud project id, matching the `auth_uri`, `token_uri`, and `project_id` fields of the downloaded client JSON; its certificate URL is unused because ID tokens are not verified locally |
| `GMAIL_API_URI`, `HASDATA_API_URI` | tests only | Point the Gmail REST calls (Emails tab, sending, mailbox watch) and the HasData calls at a local stand-in; defaults `https://gmail.googleapis.com` and `https://api.hasdata.com` |
| `MAPS_API_KEY` (alias `GOOGLE_MAPS_API_KEY`) | for TRIP-* with live data | Google Geocoding API, Places API (New) text search, and Routes API route matrix (§10.8; the project must have those three APIs enabled). Absent (and no stub) → the Sales Trip Planner reports "not configured". Calls are metered per SKU and month under Settings → Google Maps usage (`features/maps`) |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | for TRIP-06 with live data | Adzuna Job Search API (free developer key; "Jobs by Adzuna" attribution shown in the listings dialog) — §7.13 |
| `JSEARCH_API_KEY` | for TRIP-06 with live data | JSearch on RapidAPI (Google for Jobs) — §7.13 |
| `HASDATA_API_KEY`, `HASDATA_INDEED_DOMAIN` | for TRIP-06 with live data | HasData Indeed Jobs Scraper API; the domain selects a regional Indeed site. The API validates it against full host names (`ca.indeed.com`), so the adapter expands a bare country code (`ca`) and passes a value containing a dot as given (`hasDataDomain`, confirmed with a live key on November 1, 2026) — §7.13 |
| `JOBS_API_URL`, `JOBS_API_KEY` | optional | A custom job-listing source behind the JSON contract of §7.13 |
| `JOBS_COUNTRY` | optional | Country code for Adzuna and JSearch (default `ca`) |
| `JOBS_SOURCES` | optional | `stub` enables the sample listings source outside `TRIPS_PROVIDER=stub` |
| `ADMIN_SQL` | optional | `off` (or `false`, `0`, `no`) switches off `POST /api/admin/sql` (§6.16); on by default |
| `APP_COMMIT` | set by the image | The commit the `runner` image was built from (build argument `GIT_COMMIT`, which the deployer passes); reported by `GET /api/deploy`; empty for an image built by hand |
| `JOBS_KEY` | for the scheduler and the deployer | Shared secret that `scripts/jobs.mjs` (or an external cron) sends as `X-Jobs-Key` to `POST /api/jobs/run`, and `scripts/deployer.mjs` to `POST /api/deploy/agent`; compose passes `${JOBS_KEY:-dev-jobs-key}` to both the app and the `jobs` service |
| `TRIPS_PROVIDER` | development, tests | `stub` serves the in-repo sample companies (the end-to-end suite sets it; the Docker dev stack passes the value from `.env` and, since November 6, 2026, defaults to empty); empty selects the Google adapter |

`.env.setup.local` (administrator credentials as `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`, optional `PGAPPUSER` and `PGDATABASE`) is used only by the setup scripts and never by the app. In Docker the `setup` service passes the same variables as environment and does not need the file. Trip-planner keys (`MAPS_API_KEY`, `JOBS_API_URL`, `JOBS_API_KEY`) are written as blank placeholders.

### 2.2 Scripts

| Command | Script | Behaviour |
|---|---|---|
| `npm run db:create` | `scripts/create-database.mjs` | Connects to the maintenance database `postgres`, creates `leadtrailpro` when missing, then applies numbered migrations recorded in `schema_migrations`, each in its own transaction. Migration 1 creates all tables, the `set_updated_at` trigger function, and seeds list values, target templates, and settings. Idempotent. |
| `npm run db:user:create` | `scripts/create-app-user.mjs` | Creates the `leadtrailpro_app` role with LOGIN, CONNECT, USAGE on `public`, and SELECT/INSERT/UPDATE/DELETE on all current and future tables plus USAGE on sequences (identity columns), then writes `.env.local` (mode 0600). Re-running rotates the password and bootstrap key and keeps every other line already in the file. |
| `npm run db:seed` | `scripts/seed-sample-data.mjs` | Requires an administrator. Creates demo users (two Sales Managers, one Recruiter, password `leadtrailpro-demo-2026`), eleven leads across states and statuses (including one Lost Lead – Pricing and one archived Disqualified – Not Interested), activities, tasks. No-op when leads exist. |
| `npm run db:seed:users` | `scripts/seed-users.mjs` | Seed accounts (the administrator, role accounts, testers) from `seed/accounts.csv` in the repository (`SEED_USERS_FILE` overrides the path; parser in `scripts/lib/seed-accounts.mjs`; committed on November 6, 2026 at the owner's request, the repository to be made private). Columns `email,first_name,last_name,role[,stage][,password]` in any order, `#` comments. Every row is validated first (email syntax, role, stage, password length, duplicates; errors list line numbers and nothing is written); new emails are inserted in one transaction with the stage's target template and a random unusable password unless the row sets one; existing emails are left untouched; exits 0 with a note when the file is absent, so the Docker `setup` service runs it after `create-app-user.mjs`. Warns when no active administrator exists afterwards. |
| `npm run dev` / `build` / `start` | Next.js | Development server / production build / production server |
| `npm run lint` / `typecheck` | ESLint (next/core-web-vitals + typescript + react-hooks) / `tsc --noEmit` | |
| `npm run db:import -- "<workbook.xlsx>" [--dry-run]` | `scripts/import-tracker.mjs` | The sales-tracker import from the command line (§10.9): reads the workbook and the optional `--baseline`, opens one transaction, runs `runTrackerImport` from `scripts/lib/tracker-import.mjs`, commits (or rolls back on `--dry-run`), refreshes planner statistics, and writes `import-report.txt`. Options `--sheet`, `--archive-sheet`, `--clients-sheet`, `--keep-action-names`, `--force`, `--default-owner`, `--actor`, `--owner "Name=email"`, `--report`. In Docker: `docker compose run --rm setup node scripts/import-tracker.mjs …`. |
| `npm run remote -- <command>` | `scripts/ltp.mjs` | Remote administration client (§4, §6.7): calls the app's API with `LTP_URL` and `LTP_TOKEN` from `.env.remote.local` (`--env-file-if-exists`, git-ignored; `.env.remote.local.example` is the template). Commands `whoami`, `get <path> [k=v]…`, `post\|patch\|put\|delete <path> [json\|@file]`, `tokens`, `import-status`, `sql "<statement>" [--apply]`, `deploy-status [--log]`, `deploy`, `deploy-pause`, `deploy-resume` (§2.4), and `import <workbook> [--apply] [--baseline <file>] [--sheet] [--keep-action-names] [--force] [--default-owner] [--owner "Name=email"]… [--archive-sheet] [--clients-sheet] [--report]`, which posts the workbook to `/api/imports/tracker` (preview unless `--apply`) and saves the report. Exit code 1 with the server's message on any refusal. Needs only Node 22 and `npm ci`. |
| (compose `deployer`) | `scripts/deployer.mjs`, `scripts/lib/deploy-plan.mjs` | The deployer's loop and its pure rules (§2.4): reads the branch's commit, asks the app what runs, deploys when they differ or when asked, reports the result |
| `npm run jobs` | `scripts/jobs.mjs` | Scheduler: every `JOBS_INTERVAL_SECONDS` (60) it POSTs to `JOBS_URL/api/jobs/run` with `JOBS_KEY`; the app runs whatever digest is due, once per period |
| `npm run db:check` | `scripts/db-check.mjs` | Loads `.env.local` if present (`--env-file-if-exists`, so it also runs from the production image, where compose supplies the variables) and connects with the runtime role: prints server version, database, role, table and migration counts, and the number of accounts; checks the role can write; exit code 1 with a hint keyed on the error (`ENOTFOUND` for `PGHOST=db` outside Docker, `ECONNREFUSED` with the 5433/5432 and in-container cases, `28P01` password, `3D000` database missing including the rename, `28000` role, `57P03` starting up). Warns when `PGHOST=db` is used outside a container or `127.0.0.1` inside one. |
| `npm run jobs:test -- "<company>" [city]` | `scripts/jobs-test.mjs` | Dev stack or laptop only (needs `src/`): builds every job-source adapter from `.env.local` and calls each configured one for the named company, printing the listings kept after the company match or the error. Spends one call per configured source (Adzuna one hit, HasData ten credits). `--source <id>` limits it to one source. |
| `npm run maps:test -- "<address>" [--km n \| --minutes n \| --at lat,lng]` | `scripts/maps-test.mjs` | Dev stack or laptop only (needs `src/`): checks `MAPS_API_KEY` with the trip planner's Google adapter (geocode, places text search, route matrix); a refusal names the API that is not enabled; not counted by the usage meter (§10.8) |
| `npm run test:unit` | `tests/unit/*.test.mjs` | Unit tests through `node --test` (§12) |
| `npm run mail:test [-- --send [address]]` | `scripts/mail-test.mjs` | Loads `.env.local` and checks the `SMTP_*` settings without the app: connects to `SMTP_HOST` and signs in through nodemailer's `verify()`; with an empty `SMTP_PASSWORD` it checks the connection only; `--send` delivers a test message (default recipient `SMTP_USER`). Exit code 1 on failure, with a hint when Google asks for an App Password. In Docker: `docker compose run --rm app npm run mail:test -- --send` |
| `npm run test:e2e` | `tests/e2e/*.test.mjs` | Selenium suite via `node --test` (sequential, 120 s per test). Targets `E2E_BASE_URL` (default `http://app-test:3000`) and `E2E_SELENIUM_URL` (default `http://selenium:4444`). |
| `scripts/e2e.sh [files]` | compose profile `test` | Recreates the throwaway test database, builds the production image and the dev image, runs the suite, removes the test containers. Finds the Docker Desktop CLI on macOS when `docker` is not on PATH. |
| `scripts/docker-entrypoint.sh` | dev container | Runs `npm ci` into the `node_modules` volume when `package-lock.json` differs from the installed stamp, then execs the command. |
| `.gitattributes` | every checkout | `*.sh text eol=lf`: the entrypoint is copied into the Linux image, and a CRLF checkout (Windows with `core.autocrlf=true`) would make the dev container exit with "no such file or directory". |

### 2.3 Containers

`Dockerfile` (base `node:22-bookworm-slim`) has three targets: `dev` (dependencies in the image, project bind-mounted at `/app`, `next dev`), `runner` (standalone output, `.next/static`, `public/`, `scripts/`, user `node`, `node server.js` on port 3000; the build argument `GIT_COMMIT` becomes `APP_COMMIT`), and `deployer` (`docker:28-cli` with git and Node, §2.4). `.dockerignore` keeps `node_modules`, `.next`, `storage`, `.env*`, `docs`, and `tests` out of the build context.

| Service (`compose.yaml`) | Image | Role |
|---|---|---|
| `db` | `postgres:17-alpine` | Development database, volume `postgres_data`, published on `127.0.0.1:${DB_PORT:-5433}`, superuser `postgres` with password `${POSTGRES_PASSWORD:-leadtrailpro}`; the healthcheck uses `pg_isready -h 127.0.0.1` so it only passes once first-run initialisation is complete |
| `app` | `leadtrailpro-dev` (target `dev`) | Dev server on `${APP_PORT:-3000}`; volumes `node_modules` and `next_cache` shadow the host directories |
| `jobs` | `leadtrailpro-dev` (prod: `leadtrailpro` runner) | Runs `scripts/jobs.mjs` against `http://app:3000` with the shared `JOBS_KEY` |
| `setup` (profile `setup`) | `leadtrailpro-dev` | One shot: `create-database.mjs` + `create-app-user.mjs` as `postgres`; writes `.env.local` with `PGHOST=db` into the bind mount |
| `db-test` (profile `test`) | `postgres:17-alpine` | Throwaway database on tmpfs, password `test`, not published |
| `app-test` (profile `test`) | `leadtrailpro` (target `runner`) | Applies migrations then serves the production build; `APP_URL=http://app-test:3000`, `USER_MANAGEMENT_KEY=e2e-user-management-key`; healthcheck on `/api/auth/session` |
| `selenium` (profile `test`) | `selenium/standalone-chromium:4` | Chromium grid, 2 GB shm, 1600×1200 screen, noVNC on `127.0.0.1:7900` |
| `e2e` (profile `test`) | `leadtrailpro-dev` | Runs `npm run test:e2e` once `app-test` is healthy |

`compose.prod.yaml` overrides `app` with the `runner` target, `env_file: .env.local`, an `attachments` volume at `/app/storage/attachments`, `restart: unless-stopped`, and removes the database port; it requires `POSTGRES_PASSWORD` and `JOBS_KEY` in `.env`. It adds two services (§2.4): `migrate` (the `runner` image as the PostgreSQL superuser, `node scripts/create-database.mjs`, runs to completion each time the stack comes up; `app` waits for `service_completed_successfully`) and `deployer` (image `leadtrailpro-deployer`, the Docker socket, this folder read-only at `/host`, the volume `deployer_work` at `/work`).

Rename (October 30, 2026): the compose project is `leadtrailpro` (was `salestrackpro`), so the volumes are `leadtrailpro_postgres_data`, `leadtrailpro_node_modules`, `leadtrailpro_next_cache` (production: `leadtrailpro_attachments`) and the images `leadtrailpro-dev` and `leadtrailpro`. A development database created before the rename lives in `salestrackpro_postgres_data` and is not picked up: either re-run `setup` (new database `leadtrailpro`, role `leadtrailpro_app`, database lines of `.env.local` rewritten) or copy the old volume into the new one with the database stopped (README, "After the rename from SalesTrackPro"). An `.env.local` written before the rename still names `salestrackpro` and `salestrackpro_app`; that keeps working against a copied volume because `PGDATABASE` overrides the `leadtrailpro` default in `src/lib/db.ts`.

### 2.4 Releases without commands on the server (NFR-10, NFR-11) — as built November 12, 2026

The project owner works from another machine and asked that nothing has to be typed on the server for a release or a correction. Three parts, all in `compose.prod.yaml` and the API (§6.16).

**Database upgrade on start.** The `migrate` service runs `scripts/create-database.mjs` as the PostgreSQL superuser each time the stack comes up and exits; `app` depends on its successful completion. Migrations are numbered, recorded in `schema_migrations`, and applied once, so the run is a no-op when nothing is pending. Corrections of existing data that every installation needs are written as migrations too (migration 20 is one).

**Deployer.** `scripts/deployer.mjs` in the `deployer` container, every `DEPLOY_INTERVAL_SECONDS` (60, at least 15):

1. `git ls-remote` gives the commit of `DEPLOY_BRANCH` (`master`) on `DEPLOY_REPO` (default: the origin in `/host/.git/config`; an SSH address is rewritten to HTTPS; `DEPLOY_GIT_TOKEN` goes in as the HTTPS user for a private repository and is masked in every log line).
2. `POST /api/deploy/agent` `poll` is its heartbeat; the answer is the commit the app runs and whether an administrator asked for a deploy.
3. `decideDeploy` (`scripts/lib/deploy-plan.mjs`): deploy when asked; otherwise, with `DEPLOY_AUTO` on, when the branch's commit differs from the running one, except a commit whose last attempt failed. An app that does not answer is judged by the last attempted commit kept in `/work/state.json`, so a later push can repair a deploy that broke the app, while a first start waits for the app.
4. A deploy: `start` to the app; clone or fetch into `/work/repo` and check out the commit; copy `.env` and `.env.local` from `/host`; `docker compose -p <project> -f compose.yaml -f compose.prod.yaml build migrate app jobs` with `GIT_COMMIT`; `up -d --no-build db migrate app jobs`; wait up to five minutes until the app reports that commit; `finish` with success, or with the failed step, a one-line reason (`failureSummary`: the lines that name a source position or an error), and the end of the output. A result the app could not be told is kept and sent on the next check.
5. After a success it prunes dangling images and exits; the restart policy starts it again from `/work/repo/scripts/deployer.mjs`, so the deployer runs the code it deployed (the copy in the image serves the first start and a clone whose script does not parse).

A failed build or database upgrade leaves the previous containers running, because compose replaces `app` only after `migrate` has completed. The deployer never touches its own service, so a change to its lines in `compose.prod.yaml` or to the `deployer` image needs one manual `up -d --build`. The server's folder is not updated by deploys; it supplies the two settings files and the repository address.

**From another machine.** `npm run remote -- deploy-status [--log]`, `npm run remote -- deploy`, and `npm run remote -- sql "<statement>" [--apply]` (`scripts/ltp.mjs`) call `GET`/`POST /api/deploy` and `POST /api/admin/sql` with an API token.

**Pausing deploys** (November 13, 2026). A push is a release, which is not always wanted: some work is pushed to keep it safe, not to show it. Settings → Releases in the app (`features/deploy/ReleasesCard.tsx`) shows what the server runs and has a pause switch and "Deploy now"; the same from another machine with `npm run remote -- deploy-pause`, `deploy-resume` and `deploy`. The switch is `app_settings.deploy_pause` (who, when), set through `PATCH /api/deploy { paused }` and audited as `deploy.paused` / `deploy.resumed`. The app's answer to the deployer's heartbeat carries `paused`; `decideDeploy` then leaves a moved branch alone ("deploys are paused in the app…") while a request still deploys, and the pause stays on afterwards. While the app does not answer, the deployer keeps to what it was told last (`state.json`). `GET /api/deploy` adds `paused` and `waiting` (paused and the branch is ahead). `DEPLOY_AUTO=off` in the server's `.env` remains the permanent form of the same thing.

---

## 3. Data model

ER summary: `users` own `leads`; `leads` have many `lead_activities`, `tasks`, `lead_attachments`; `list_values` are referenced by seven lead columns (ten since migrations 4, 18 and 21); deals link to `organizations` and `persons` (§3.25); `target_templates` are referenced by `users`; `audit_log` references everything loosely by `(entity_type, entity_id)`.

All tables live in the `public` schema of the `leadtrailpro` database. Ids are `GENERATED ALWAYS AS IDENTITY`; instants are `TIMESTAMP(0)` holding UTC; JSON is `JSONB`; every table with `updated_at` has a `BEFORE UPDATE` trigger calling `set_updated_at()`. Comparisons are case-sensitive (unlike MySQL's collation), so emails are lower-cased before storage and lookup, and keyword search applies `LOWER()`.

### 3.1 `users`

| Column | Type | Notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| first_name, last_name | VARCHAR(80) | |
| email | VARCHAR(254) UNIQUE | lower-cased |
| phone | VARCHAR(40) | |
| password_hash | VARCHAR(180) NULL | `scrypt$<salt hex>$<key hex>` (16-byte salt, 64-byte key); NULL for an account without a password (migration 12, Google-only sign-in, §7.17) |
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

id · list_key VARCHAR(40) (`lead_type`, `status`, `bd_action`, `client_response`, `lead_category`, `company_size`, `city`, `lost_reason`, `disqualified_reason` (migration 4), `business_type` (migration 5), `opportunity_reason` (migration 11), `stage` (migration 18: the pipeline stages in board order, PIPE-01; `new_deal` is relied on by code as the entry stage and cannot be deactivated), `todo_list` (migration 21, §10.12)) · code VARCHAR(60) (stable slug; `cold/warm/hot/client/lost/disqualified` are relied on by code) · value VARCHAR(120) (display, renamable) · sort_order INT · is_active BOOLEAN · timestamps. Unique (list_key, code) and (list_key, value); since migration 26 the second is (list_key, pipeline_id, value), and `stage` rows carry `pipeline_id` (§3.26). The five `disqualified_reason` rows are seeded and cannot be deactivated or added to; `lost_reason` is an ordinary Admin list seeded with "Pricing". `stage_id` INTEGER NULL REFERENCES list_values ON DELETE SET NULL (migration 18): on `bd_action` rows, the stage the action lands a lead in (PIPE-03), NULL when the action is not mapped (it then counts as Contact Made); edited under List of values → BD action.

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
| stage_id | FK list_values NULL (SET NULL), indexed (migration 18) | PIPE-02: the pipeline stage (§10.11); placed from the BD action by the migration or Recompute stages, chosen on the form, moved on the board; NULL only for a lead never placed |
| todo_list_id | FK list_values NULL (SET NULL), partial index (migration 21) | TODO-01: the To Do list the lead is on (§10.12); set and cleared by hand only |
| todo_since | TIMESTAMP(0) NULL | When the lead was put on that list; the To Do page sorts by it |
| organization_id | FK companies NULL (SET NULL), indexed (migration 23) | The company the deal belongs to (§10.14); the deal's client columns are kept equal to it |
| person_id | FK persons NULL (SET NULL), indexed (migration 23) | The contact person, when the deal names one |
| deal_value | NUMERIC(12,2) NULL, ≥ 0 (migration 24) | PD-11: optional value in CA$ (§10.15) |
| expected_close_date | DATE NULL (migration 24) | PD-11: optional |
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

Activity types: `created`, `call`, `email`, `visit`, `note`, `status_change`, `bd_action`, `client_response`, `follow_up`, `transfer`, `state_change`, `task`, `file`, `edit`, `listing`, `stage_change` (PIPE-05: `value_code` = the new stage code, `meta` = { fromStageId, toStageId, fromCode, toCode, via: `board` | `detail` | `bd_action` }), `todo` (TODO-02, migration 21: a move on or off a To Do list, §10.12). The first five are user-logged; the rest are system-generated. Notes and logged calls on a contact itself are kept apart in `contact_activities` (§3.26).

### 3.8 `tasks` (TASK-02)

id BIGINT · lead_id NULL FK (CASCADE) · title VARCHAR(200) · description TEXT · assignee_id FK · creator_id FK · due_at TIMESTAMP(0) NULL · priority low/normal/medium/high · status open/done · checklist JSONB `[{text, done}]` · completed_at · created_at, updated_at. Indexes on (assignee_id, status, due_at), lead_id, (creator_id, created_at).

### 3.9 `lead_attachments` (FILE-*)

id BIGINT · lead_id FK (CASCADE) · uploaded_by FK · category `document` | `profile` · label VARCHAR(120) (JD, Agreement, …, candidate name) · file_name VARCHAR(255) · mime_type · size_bytes · storage_key VARCHAR(255) (relative path under ATTACHMENT_DIR) · version INT · replaces_id NULL (previous version) · deleted_at, deleted_by NULL (soft delete) · created_at.

### 3.10 `audit_log` (AUD-*)

id BIGINT · actor_id NULL · action VARCHAR(60) · entity_type VARCHAR(40) (`lead`, `user`, `task`, `attachment`, `list_value`, `target_template`, `setting`, `session`) · entity_id NULL · before_json, after_json JSONB NULL (only changed keys for updates) · details VARCHAR(500) · created_at. Indexes on (entity_type, entity_id, created_at), (actor_id, created_at), created_at.

Action catalogue: `user.created/updated/password_changed/terminated/target_assigned`, `lead.created/queued/updated/transferred/reassigned/approved/rejected/archived/restored/call_logged/email_logged/visit_logged/note_logged`, `task.created/updated/completed`, `attachment.uploaded/replaced/deleted`, `list_value.created/renamed/updated/reordered`, `target_template.created/updated`, `setting.updated`, `seed.sample_data`. Later additions are named in the sections that describe them, with the entity types `message`, `opportunity`, `opportunity_search`, `sales_trip`, `api_token`, `job`, `organization`, and `person`: for example `message.*` (§6.11), `task.comment*` (§6.12), `trip.*` (§6.9), `opportunity.*` (§6.13), `lead.stage`, `lead.stages_recomputed`, `lead.todo` (§6.4, §6.15), `api_token.*` (§3.24), `deploy.*` and `admin.sql.*` (§6.16), `report.kpi` (§7.18), `organization.*` / `person.*` (§10.14, §10.16), `pipeline.created/updated` (entity type `setting`, §10.18).

### 3.11 `target_templates` (TGT-*)

id · name VARCHAR(80) UNIQUE · stage · daily_leads · weekly_leads · daily_visits · weekly_visits · monthly_conversions · timestamps. Seeded: Onboarding (2/10/1/4/1), Training (3/15/2/8/2), Full Productive (5/25/3/12/4).

### 3.12 `app_settings`

setting_key PK · value_json. Keys: `role_labels` `{admin, sales_manager, recruiter}` (ROLE-02), `reminders` `{inactivityDays, rules: [{statusId, bdActionId, stageId, days}]}` (TASK-05, PIPE-08: list-value ids or null for "any"; a rule needs at least one of the three; duplicates of a triple collapse; 1–365 days; migration 19 seeds one rule per stage once), `pipeline` `{followUps: {<stage code>: {activity: call|email|visit|task, businessDays 0–60}}, promptNextStep, autoFollowUp}` (PIPE-09, §10.11; defaults: Contact Made → call in 1 business day, Profile Shared → call in 3, prompt on, auto off), `business_calendar` `{holidays: [{date, name}]}` sorted by date (RPT-03, TASK-03). Further keys, described where they are used: `digests` (§3.18), `job_sources` (§3.21), `opportunities` (§3.22, §7.14), `email` `{senderUserId, reportEmails, kpiReports, watchMailboxes}` (migration 12, §7.17, §7.18, §10.2), `maps` `{budgets, warnAtPercent}` (migration 13, §10.8), and the deploy keys `deploy_agent`, `deploy_request`, `deploy_failure_log`, `deploy_pause` (§2.4, §6.16).

### 3.13 `schema_migrations`

version PK · name · applied_at. Versions: 7 notifications, `users.notification_prefs`, `job_runs`, and the `digests` setting (§3.17–3.18); 1 core schema; 2 `users.auto_logout_time` and the `business_calendar` setting; 3 `gmail_connections`; 4 status reasons (LEAD-06: `leads.status_reason_id`, the `lost_reason` and `disqualified_reason` lists, the `lost` and `disqualified` status rows); 5 sales trips (`business_type` list, `sales_trips`, `sales_trip_results`, §3.15); 6 `mail_outbox` (§3.16); 18 pipeline stages (§10.11: the `stage` list, `leads.stage_id`, `list_values.stage_id` on BD actions, the default mapping, and the one-time placement of every lead); 19 the proposed needs-attention days per stage appended to `reminders.rules` once, while no stage rule exists (New Deal and Contact Made 3, Qualified through Negotiations started 5, Contract Signed none). The others: 8 `lead_messages` (§3.19); 9 `task_comments` (§3.20); 10 `job_listing_cache`, `job_source_usage` (§3.21); 11 the opportunity pool (§3.22); 12 `users.password_hash` nullable and the `email` setting (§7.17); 13 `maps_usage` and the `maps` setting (§10.8); 14 the mailbox watch (§3.23); 15 opportunity search titles and window (§3.22); 16 `api_tokens` (§3.24); 17 `opportunities.draft` (§3.22); 20 `created_by` of imported leads corrected (§10.9); 21 To Do lists (§10.12); 22 the two seeded values renamed for the new names (§10.13); 23 `organizations`, `persons` (§3.25); 24 deal value and expected close date; 25 `contact_activities`, `organizations.aliases`; 26 `pipelines` (§3.26). 27 every contact belongs to a company: `persons.organization_id` NOT NULL, removing a company removes its contacts, one name per company (§10.19). 28 Referral added to the deal sources (`lead_type`, §10.20); 29 `tasks.activity_type` and `tasks.ends_at` (§10.20). Master holds 29 migrations.

### 3.14 `gmail_connections` (MAIL-01)

user_id PK FK → users (CASCADE) · google_email VARCHAR(254) · refresh_token_encrypted TEXT (AES-256-GCM under SHA-256(`GMAIL_TOKEN_KEY`), stored as `iv.tag.ciphertext` base64) · created_at · updated_at. One link per user; reconnecting replaces it.

### 3.15 `sales_trips` and `sales_trip_results` (TRIP-*, migration 5)

`sales_trips`: id · owner_id FK users · title VARCHAR(120) · address VARCHAR(500) · latitude, longitude DOUBLE PRECISION NULL (geocoded origin) · radius_type `km` | `minutes` (CHECK) · radius_value SMALLINT · business_type_id FK list_values NULL (SET NULL) · max_results SMALLINT (≤ 50) · provider VARCHAR(40) (`stub` or `google`) · last_run_at · result_count · timestamps (updated_at trigger). Index (owner_id, created_at).

`sales_trip_results`: id · trip_id FK (CASCADE) · sequence · company_name VARCHAR(200) · address VARCHAR(500) · latitude, longitude · distance_km NUMERIC(7,2) NULL · drive_minutes SMALLINT NULL · website VARCHAR(2048) · phone VARCHAR(40) · provider_place_id VARCHAR(120) · job_count SMALLINT NULL (NULL = no job source) · jobs JSONB NULL (the dialog rows) · jobs_fetched_at · matched_lead_id FK leads NULL (SET NULL) · action_code VARCHAR(40) (`new` or a status code) · action_label VARCHAR(160) · shortlisted BOOLEAN · planned_visit_date DATE NULL · created_at. Index (trip_id, sequence). Results are a snapshot taken when the trip is created or re-run.

### 3.16 `mail_outbox` (MAIL_PROVIDER, migration 6)

id BIGINT · to_address · subject · status `stubbed` | `sent` | `failed` (CHECK) · error VARCHAR(500) NULL · text_body TEXT NULL (only for stubbed messages) · created_at. Every `sendMail` call records a row (the newest 500 are kept); a missing table never breaks the caller. Administrators see the latest 20 under Settings → Email delivery.

### 3.17 `notifications` (NTF-01/02, migration 7)

id BIGINT · user_id FK (CASCADE) · type (`task_assigned`, `task_updated`, `task_completed`, `lead_status`, `lead_transferred`, `queued_lead`, `queued_reviewed`, `file_uploaded`, `mention`, `message`, `daily_digest`, `weekly_digest`; later `task_comment` (§6.12), `opportunities_found` and `listing_found` (§7.14), `maps_usage` (§10.8), `email_received` (§10.2), `jobs_usage` (§7.13)) · title VARCHAR(200) · body TEXT NULL · lead_id FK NULL (SET NULL) · task_id FK NULL (SET NULL) · read_at NULL · created_at. Index (user_id, read_at, id). `users.notification_prefs` JSONB `{dailyDigest, weeklyDigest, emailEvents}` (NTF-05; defaults true, true, false).

### 3.18 `job_runs` (TASK-06)

id · job (`daily` | `weekly`) · period_key (the business date, `week-<Monday>`, or `manual-<instant>-<actor>`) · status `running` | `success` | `partial` | `failed` · details · started_at · finished_at. UNIQUE (job, period_key) is the lock that makes a digest run once per period however many schedulers call in. The same lock serves the later jobs: `opportunities` (§6.13), `mailbox_watch` (§10.2), `kpi_daily` / `kpi_weekly` / `kpi_monthly` (§7.18), `stalled_report` (§7.16), the usage alerts `maps:<sku>:<percent>` and `jobs:<source>:<percent>` (§10.8, §7.13), and `deploy` runs (§6.16). The `digests` setting (`{enabled, dailyTime, weeklyDay, weeklyTime}`) lives in app_settings.

### 3.19 `lead_messages` (COLL-*, migration 8)

id BIGINT · lead_id FK (CASCADE) · parent_id FK self NULL (CASCADE; replies are kept one level deep, a reply to a reply is attached to the root) · author_id FK users · body TEXT (the rich-text format of §7.12, stored as written) · mentions JSONB (`[{kind: all|admin|recruiter|salesmanager} | {kind: user, userId, name}]`, parsed on save) · attachment_ids JSONB (ids of `lead_attachments` on the same lead, COLL-06) · quoted_message_id FK self NULL (SET NULL) · edited_at NULL · deleted_at NULL · deleted_by FK users NULL · created_at. Indexes (lead_id, id) and (parent_id). A removed message keeps its row and text (the API blanks the body, mentions, and attachments and reports who removed it); the audit entry `message.deleted` carries the original text.

### 3.20 `task_comments` (TASK-04, COLL-06, migration 9)

id BIGINT · task_id FK tasks (CASCADE) · author_id FK users · body TEXT (rich-text format of §7.12) · mentions JSONB · attachment_ids JSONB (ids of `lead_attachments` on the task's lead) · edited_at NULL · deleted_at NULL · deleted_by FK users NULL · created_at. Index (task_id, id). Same removal semantics as `lead_messages`: the row and text stay, the API blanks the body, the audit entry `task.comment_removed` keeps the text. Task rows carry a live `commentCount`.

---

### 3.21 `job_listing_cache` and `job_source_usage` (TRIP-06, migration 10)

`job_listing_cache`: id · company_key VARCHAR(200) (normalised company name, §10.8 rules) · company_name · source VARCHAR(20) · listings JSONB (the dialog rows) · fetched_at. UNIQUE (company_key, source); index (company_key, fetched_at). One row per company and source; the freshest row answers a lookup within `cacheHours`.

`job_source_usage`: source · day DATE · calls · failures, PRIMARY KEY (source, day). Incremented per call (`ON CONFLICT … DO UPDATE`); summed for today and the calendar month to enforce the budgets. The `job_sources` setting (`{ order, budgets: { <source>: { enabled, daily, monthly } }, cacheHours, prefetch }`) lives in app_settings.

### 3.22 `opportunity_searches`, `opportunity_runs`, `opportunities`, `opportunity_listings` (OPP-*, migration 11)
`opportunity_searches`: id · name VARCHAR(120) · titles JSONB (the job titles, migration 15) · keyword VARCHAR(500) (the query the sources receive, built by `indeedKeyword`: one title as typed, several as `"multi word" OR single OR ...`) · posted_within_days INTEGER (default 30, migration 15) · location VARCHAR(160) · job_type VARCHAR(60) ('' | full_time | part_time | contract | permanent) · max_listings INTEGER NULL (per source; NULL = the Settings default) · is_active · created_by FK users (SET NULL) · last_run_at · last_found · last_new · created_at · updated_at (trigger).
`opportunity_runs`: id · trigger_kind ('scheduled' | 'manual') · status ('running' | 'success' | 'partial' | 'failed') · actor_id FK users (SET NULL) · started_at · finished_at · listings_found · new_companies · new_listings · attached · details TEXT (per-source notes and errors, " · "-joined).
`opportunities` (one card per company): id · company_key VARCHAR(200) UNIQUE (`normalizeCompanyName`) · company_name · website · location · status ('new' | 'attached' | 'converted' | 'not_relevant') · lead_id FK leads (SET NULL; the lead it became or feeds) · matched_lead_id FK leads (SET NULL; a closed or archived lead found at discovery, shown as history) · revived BOOLEAN (came back after not relevant, converted, or attached) · reason_id FK list_values `opportunity_reason` · reason_scope ('company' | 'role') · reason_note VARCHAR(500) · decided_by FK users · decided_at · listings_count · latest_title · first_seen_at · last_seen_at · draft JSONB NULL (migration 17: the lead and timeline entries the tracker import drafted for a company with no Sales Manager, §10.9; cleared when the card is assigned or the company becomes a lead) · created_at · updated_at (trigger). Index (status, last_seen_at).
`opportunity_listings`: id · opportunity_id FK (CASCADE) · source VARCHAR(20) (job source id) · source_key VARCHAR(300) (`listingKey`: the source's job id, else the URL without tracking parameters) · title · location · employment_type · posted_at DATE · url VARCHAR(2048) · search_id FK opportunity_searches (SET NULL) · lead_id FK leads (SET NULL) · first_seen_at · last_seen_at; UNIQUE (opportunity_id, source_key); index on lead_id.
The migration also makes `lead_activities.user_id` nullable (timeline entries written by a scheduled run show "LeadTrailPro" as the author), seeds the `opportunity_reason` list (Existing client, Existing lead, Not our industry, Role not relevant, Company not suitable, Duplicate, Location not relevant, Other), and stores the default schedule under `app_settings.opportunities`.

### 3.23 `lead_emails` and the mailbox-watch columns (MAIL-01, migration 14)

`lead_emails(id, lead_id → leads, user_id → users (the mailbox owner), mailbox, gmail_message_id, thread_id, direction sent|received, from_address, subject, received_at, created_at)`, unique on `(mailbox, gmail_message_id, lead_id)` so a rescan never stores a message twice and a message exchanged with two leads (duplicate client address) is kept for both; index `(lead_id, received_at)`. `leads.last_client_email_at` (newest message whose sender is one of the lead's client addresses) and `leads.last_team_email_at` (newest message the connected mailbox sent to the client) feed the "awaiting reply" rule (`replyWaiting` in `features/gmail/watch-model.ts`: client email newer than both the team's last email and `last_activity_at`). `gmail_connections.watch_since` is the scan watermark (Gmail internal date of the newest message seen) and `watch_checked_at` the time of the last scan. Only headers and the Gmail snippet are stored, never bodies.

### 3.24 `api_tokens` (personal access tokens, USR-11, migration 16)

`api_tokens(id, user_id → users (cascade), name ≤ 80, token_hash CHAR(64) unique (SHA-256 of the token), token_prefix (the first 12 characters, "ltp_" plus eight, for the list), expires_at NULL = never, last_used_at (stamped at most once a minute), revoked_at, created_at)`; index `(user_id, revoked_at)`. The token itself (`ltp_` plus 32 random bytes in base64url, 47 characters) is returned once by `POST /api/api-tokens` and never stored. Creation and revocation are audited as `api_token.created` / `api_token.revoked` (entity type `api_token`).

### 3.25 `organizations` and `persons` (contacts, migration 23, §10.14)

`organizations`: `id`, `name`, `name_key` (the name in lower case without outer spaces, unique), `website`, `address`, `city_id` and `company_size_id` (list values), `industry`, `owner_id`, `created_by`, `created_at`, `updated_at`. `persons`: `id`, `organization_id` (null while the person has none), `name`, `name_key`, `emails` (JSON list), `phone`, `alt_phone`, `remark`, `owner_id`, `created_by`, `created_at`, `updated_at`; unique on (`organization_id`, `name_key`) when the company is set. `leads.organization_id` and `leads.person_id` reference them (set null on delete). The deal's own contact columns stay and are kept equal to the linked records (§10.14). Since §10.19 (built November 16, 2026): migration 27 makes `persons.organization_id` NOT NULL.

### 3.26 Later additions of November 13, 2026

`leads.deal_value` (NUMERIC 12,2, null or ≥ 0) and `leads.expected_close_date` (migration 24, §10.15). `contact_activities`: `id`, exactly one of `organization_id` / `person_id` (deleted with the contact), `user_id`, `activity_type` (note, call, email, visit), `summary`, `body`, `occurred_at`, `created_at`; `organizations.aliases` (JSON list of earlier names) (migration 25, §10.16). `pipelines`: `id`, `name` (unique), `sort_order`, `is_active`, `is_default`; `list_values.pipeline_id` for `stage` rows, and the unique rule on list values is (list, pipeline, value) (migration 26, §10.18).

### 3.27 Additions of November 18, 2026 (§10.21)

- `leads.archive_reason_id` (a `list_values` row of the list `archival_reason`, set null on delete): the Archival reason of an archived deal; its notes stay in `state_reason`. Restoring clears it. Migration 30 seeds the list: Approach Later, Not Interested, Do not use Agency, No Response, Not Hiring, Inactive Deal, Other.
- `visit_trips`: `id`, `title` (≤ 160), `trip_date` (DATE), `owner_id` (the salesperson), `created_by`, `created_at`, `updated_at`; index on (`trip_date`, `owner_id`). Migration 31. The name keeps these apart from the Sales Trip Planner's `sales_trips` (§3.15).
- `visit_trip_deals`: (`trip_id`, `lead_id`) primary key, `sort_order` (visiting order), `added_by`, `added_at`, `from_todo_list_id` (the To Do list the deal was on when it joined the trip, so it can go back there); deleted with the trip or the deal. Migration 31.
- `list_values` list `recent_trips_limit`: one value (code `count`, value `30`, rename only) giving the number of trips in Recent Planned Trips. Migration 31.

## 4. Authentication and session design

| Topic | Design |
|---|---|
| Password hashing | Node `scrypt`, 16-byte random salt, 64-byte key, constant-time compare. Unknown accounts hash a dummy value so timing does not reveal existence (AUTH-01). |
| Session | 32 random bytes (base64url) in cookie `leadtrailpro_session` (httpOnly, SameSite=Lax, Secure in production unless `APP_URL` is `http://`, 8 h). Only the SHA-256 hash is stored. Sessions are deleted on sign-out, password change (other sessions), termination, and deactivation. |
| Auto sign-out (AUTH-07) | On every request, if the account has `auto_logout_enabled` and the session was created before the latest occurrence of the account's `auto_logout_time` (default 23:00) in the business timezone, the session is deleted and the request is treated as signed out. |
| Two-factor (AUTH-06) | Password OK + `two_factor_enabled` → create `email_tokens` row (purpose `two_factor`, hash of a 6-digit code, hash of a random challenge), set cookie `leadtrailpro_2fa` (10 min), email the code, respond `{requiresTwoFactor:true}`. `POST /api/auth/two-factor` matches cookie + code, max 5 attempts, then creates the session and clears the challenge cookie. Requires SMTP; sign-in explains when it is missing. |
| Password reset (AUTH-05) | `POST /api/auth/forgot-password` always returns 200 when SMTP exists (503 "not configured" otherwise); creates a 30-minute token (max 3 per 15 min per user) and emails `${APP_URL}/?reset=<token>`. The SPA reads `?reset=`, shows the reset form, and calls `POST /api/auth/reset-password`, which consumes the token and revokes all sessions. Admins can trigger the same email per user (invitation). |
| Google sign-in (AUTH-03) | `GET /api/auth/google` (signed-out only) stores `signin.<state>.<verifier>` in the 10-minute cookie `leadtrailpro_google_state` (path `/api/auth/google`, `googleStateCookieOptions` in `session.ts`) and redirects to Google (`consentUrl()` in `features/gmail/gmail.ts`): scope `openid email profile gmail.readonly`, `access_type=offline`, `include_granted_scopes`, PKCE S256, `prompt=select_account`. The shared callback decodes the cookie (`decodeGoogleState`), checks the state, exchanges the code with the verifier (`exchangeCode`), reads `email`, `email_verified`, `given_name`, `family_name` from the ID token (`profileFromIdToken`; not signature-checked because the token came straight from Google's token endpoint over TLS), and signs in the active `users` row with that email: `login_history` row, the normal session cookie. Mailbox: when the granted `scope` includes Gmail and a refresh token came back (first consent) it is stored through `saveConnection` and the landing is `/?gmail=connected`; a returning person (no new refresh token) keeps the stored one, or is sent through `/api/gmail/connect` (`prompt=consent`) when none is stored; an unticked Gmail box lands on `/?gmail=declined` and the Emails tab offers Connect. No account is created (AUTH-01); an unknown or inactive email, a cancelled consent, or a failed exchange redirects to `/?login=unknown_account\|denied\|failed`, which `AuthScreen` turns into a message ("Sign-in failed: these credentials are not valid or you are not registered. Please contact your administrator."). Two-factor is not applied to Google sign-ins. Google-only: when `GET /api/auth/session` reports `googleSignIn: true` (client id and secret set) the sign-in screen shows only the Google button, `POST /api/auth/login` answers 403, and the Change password menu entry is hidden (`passwordSignIn` prop of `AppShell`); the password form, API, and menu entry remain for stacks without a client, such as the browser suite (owner's decision, November 5, 2026). Decided by the project owner on November 5, 2026: mailbox consent at sign-in for everyone, accepting that the restricted Gmail scope keeps sign-in limited to test users until Google's verification and that Testing-mode refresh tokens expire after seven days. The screen was published on November 6, 2026 (In production, unverified): no test users, no seven-day expiry, Google's unverified-app warning on each person's first consent (passed through Advanced), and a lifetime cap of 100 people who may accept it; the app's users table alone decides who signs in. |
| Rate limiting (AUTH-11) | `login_history` counts failures in the last 15 minutes (`NOW() AT TIME ZONE 'UTC'` minus an interval): ≥10 per email or ≥50 per address → 429. Works across instances and restarts. |
| API tokens (personal access tokens, November 10, 2026) | An administrator (`manage_settings`) creates a token under Administration → API access (`features/admin/ApiTokensPanel.tsx`; name, expiry 30/90/365 days or never) and sends it as `Authorization: Bearer ltp_…` from scripts or another machine (`scripts/ltp.mjs`, `npm run remote`). `getRequestUser()` in `features/users/session.ts` checks the header first: when it is present the request is authenticated by the token alone (`getApiTokenUser` in `api-token-repository.ts`: hash lookup, not revoked, not expired, account active; `last_used_at` stamped at most once a minute) and the cookie is ignored, so an unusable token is a 401 even next to a valid cookie. The token acts as its creator with the account's privileges at request time; termination or deactivation disables it, revocation (`DELETE /api/api-tokens/{id}`) is immediate, and a token cannot create tokens (`POST /api/api-tokens` answers 403 to a bearer request). Pure helpers (`api-token-model.ts`: pattern, bearer parsing, expiry, input validation) are unit-tested. |
| CSRF | Every state-changing request must carry an `Origin` equal to the request origin, `APP_URL`, `TRUSTED_ORIGINS`, or the `X-Forwarded-Proto/Host` pair. Cookies are SameSite=Lax. A request that carries `Authorization: Bearer …` is exempt (`hasBearerToken` in `lib/http.ts`): browsers never attach that header on their own and a page on another origin cannot set it without a CORS preflight, which the app does not answer, so it cannot be forged cross-site; the token still has to be valid for the request to be served. |
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
| reassign_leads | ✓ | ✓ | | Reassign any lead, bulk, create for others (OWN-03); a Sales Manager default since November 6, 2026 so a colleague's leads can be handed over without an Admin |
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
| manage_settings | ✓ | | | Role labels, reminders, every Settings section; API access, Tracker import, deploys and `POST /api/admin/sql` (§6.7, §6.16) |
| view_audit | ✓ | | | Audit endpoint and lead Audit tab |

Effective privileges = role defaults ∪ `users.privileges` (extras). Extras are stored only when they add to the defaults.

Since §10.19 (PD-21, built November 16, 2026): a new privilege `manage_stages` ("Edit pipeline stages") for Admin and Sales Manager by default.

### 5.2 Lead-level rules

- `canEditLead(user, lead)` = `edit_any_lead` or (`edit_leads` and `lead.ownerId == user.id`).
- `canTransferLead(user, lead)` = `reassign_leads` or (`transfer_leads` and owner).
- Receiving owner must be active and not a Recruiter.
- Tasks: assignee, creator, or `edit_any_lead` may update; status changes set `completed_at`.
- Reports: a user may request their own report; others need `view_team_reports`.

---

## 6. API specification

All endpoints return JSON; errors are `{ "error": string }` with status 400 (validation; also PostgreSQL foreign-key, check, and data exceptions 23503/23514/22xxx), 401 (not signed in), 403 (forbidden/origin), 404, 409 (duplicate, unique_violation 23505), 429 (rate limit), 503 (database or mailer unavailable). State-changing methods require the `Origin` header (§4) unless the request carries an API token. Every endpoint accepts `Authorization: Bearer ltp_…` (a personal access token, §3.24, §4) in place of the session cookie; the token acts as the administrator who created it.

### 6.1 Authentication

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `GET /api/auth/session` | none | | `{ user \| null, needsSetup, googleSignIn }` (`googleSignIn`: client id and secret are set) |
| `POST /api/auth/login` | none | `{ email, password }` | `{ user, expiresAt }` + session cookie, or `{ requiresTwoFactor, email }` + 2FA cookie; 403 while a Google client is configured (Google-only sign-in) |
| `POST /api/auth/two-factor` | 2FA cookie | `{ code }` | `{ user, expiresAt }` |
| `DELETE /api/auth/session` | session | | `{ ok }`; cookie cleared |
| `POST /api/auth/password` | session | `{ currentPassword, newPassword }` | `{ ok }` |
| `POST /api/auth/forgot-password` | none | `{ email }` | `{ ok, message }` (503 without SMTP) |
| `POST /api/auth/reset-password` | none | `{ token, password }` | `{ ok }` |
| `GET /api/auth/google` | none | | redirects to Google consent (identity + read-only Gmail, offline access, PKCE, state cookie with purpose `signin`); `/` when already signed in, `/?login=not_configured` without a client |
| `GET /api/auth/google/callback` | state cookie | `?code&state` | purpose `signin`: session cookie + redirect to `/`, `/?gmail=connected` (mailbox token stored), `/?gmail=declined` (Gmail box unticked), or `/api/gmail/connect` (returning person with no stored token); refusals `/?login=unknown_account\|denied\|failed`. Purpose `connect`: stores a fresh token for the signed-in person, `/?gmail=connected\|denied\|failed` |

### 6.2 Reference and settings

| Method & path | Auth | Response |
|---|---|---|
| `GET /api/reference` | session | `{ listValues (active, by key), pipelines (§10.18), users (active directory), roleLabels, inactivityDays, pipeline (the `pipeline` setting), holidays (dates), targetTemplates, mailerConfigured, passwordSignIn, today, timeZone }` |
| `GET /api/settings` | session | `{ settings, mailerConfigured, mail: { provider: gmail\|stub\|smtp\|off, outbox (latest 20), senders (mailboxes that can send, §7.17) }, jobSources, maps (§10.8), timeZone }`; outbox, senders, jobSources and maps for administrators only |
| `PATCH /api/settings` | manage_settings | `{ roleLabels?, reminders? { inactivityDays, rules? [{statusId, bdActionId, stageId, days}] }, pipeline? { followUps, promptNextStep, autoFollowUp } (§3.12), holidays? [{date, name}] }` → `{ settings }` (holidays: valid dates, names ≤ 80 characters, ≤ 400 entries, duplicates collapse; rule ids must exist in the status and BD action lists) |

`GET /api/settings` also returns `jobSources` (for administrators): every source with `configured`, `enabled`, `budget`, `usage { today, month, failuresToday }`, and a `note` when it cannot be used; `PATCH /api/settings` accepts `jobSources` (§3.21), validated by `normalizeJobSources` and audited as `setting.updated`. `PATCH /api/settings` also accepts `digests` (§3.18), `opportunities` (§6.13), `email` (§3.12, §7.17, §7.18), and `maps` (§10.8). `GET /api/trips/{id}` adds `jobsConfigured`; `GET /api/trips/{id}/results/{resultId}/jobs` answers 503 with the reason when no source can answer and the company has no stored listings.

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
| `GET /api/leads` | view_leads | Query: `state` (active/queued/archived), `q`, `mine`, `statusCode`, `statusId`, `leadTypeId`, `leadCategoryId`, `companySizeId`, `cityId`, `ownerId`, `clientResponseId`, `bdActionId`, `firstContactFrom/To`, `followUpFrom/To`, `contractSignedFrom/To`, `sort` (last_activity/first_contact/follow_up/client_name/owner/created, and later client_reply §10.2 and todo_since §10.12), `direction`, `page`, `pageSize` → `{ leads, total, page, pageSize }` |
| `POST /api/leads` | create_leads | LeadInput (+ `ownerId` for admins) → `{ lead }` (201); queued when historical and no review privilege |
| `GET /api/leads/{id}` | view_leads | `{ lead, activities, tasks, attachments, audit (if view_audit), permissions: { edit } }` |
| `PATCH /api/leads/{id}` | canEditLead | partial LeadInput → `{ lead }`; generates status/BD action/response/follow-up/edit timeline entries and a field-level audit diff |
| `PATCH /api/leads/{id}/stage` | canEditLead | `{ stageId, via?: board \| detail }` → `{ lead, task }` (PIPE-05): a `stage_change` timeline entry and an audit row `lead.stage`; 400 for a queued or archived lead or an inactive stage; no change when the lead is already there. `task` is the stage's suggested task when Settings → Pipeline creates it automatically (PIPE-09), else null; `PATCH /api/leads/{id}` answers the same way when a BD action or an explicit stage moved the lead |
| `POST /api/leads/{id}/transfer` | canTransferLead | `{ ownerId, reason }` |
| `POST /api/leads/{id}/review` | review_queued | `{ approve, comment }` |
| `POST /api/leads/{id}/state` | archive_leads | `{ state: active\|archived, reason, archiveReasonId }` (PD-34): archiving needs `archiveReasonId` (an active `archival_reason` value; 400 "Choose the archival reason." otherwise) and `reason` holds the optional notes; restoring clears the reason. Timeline and audit read "Deal archived — Not Hiring: notes" |
| `POST /api/leads/{id}/activities` | add_notes (note) / log_activities (call, email, visit); manage_tasks for `followUpTask` | `{ type, summary, body, occurredAt, followUpTask?: { title, description?, dueAt, assigneeId? (owner), priority?, setFollowUpDate? } }` → `{ activity, task, lead }`. The task is created after the activity (active leads only); with `setFollowUpDate` and edit rights the lead's follow-up date moves to the due date (business-timezone day). |
| `GET /api/leads/{id}/attachments` | view_leads | `{ attachments }` |
| `POST /api/leads/{id}/attachments` | upload_files | multipart `file`, `category`, `label` → `{ attachment }` |
| `POST /api/leads/bulk` | archive_leads / reassign_leads / edit_leads (stage, todo) | `{ ids, action: archive\|restore\|reassign\|stage\|todo, ownerId?, reason?, stageId?, todoListId?, archiveReasonId? }` (`archive` needs `archiveReasonId`, PD-34) → `{ count }`; `stage` (PIPE-11) moves every selected active lead the caller may edit, with a `stage_change` entry each (`via: list`), and skips the rest; `todo` (TODO-03) puts them on the list `todoListId`, or takes them off with `todoListId: null`, the same way |
| `PATCH /api/leads/{id}/todo` | canEditLead | `{ listId }` (a `todo_list` value, or null to take the lead off) → `{ lead }` (TODO-02): sets `todo_list_id` and `todo_since`, writes a `todo` timeline entry ("To Do: added to …", "moved from … to …", "removed from …") and an audit row `lead.todo`; 400 for a lead that is not active (taking off is always allowed) or an inactive list; no change and no entry when the lead is already there |
| `GET /api/leads/todo` | view_leads | → `{ counts: { lists: [{ listId, mine, everyone }], mine, everyone } }` (TODO-04): active leads per To Do list, the caller's own and everyone's |
| `GET /api/attachments/{id}` | view_leads | file bytes; `inline` for PDF/image/text, `attachment` otherwise or with `?download=1`; `nosniff`, CSP sandbox |
| `DELETE /api/attachments/{id}` | delete_files | soft delete |

LEAD-06/07: `LeadInput.statusReasonId` is required when the status code is `lost` or `disqualified` (400 "Choose a reason for the … status" otherwise) and is stored as NULL for every other status, even when sent; `GET /api/leads` filters by `statusReasonId`; every lead summary carries `statusReason` and `statusLabel` ("Status – Reason"). `POST /api/list-values` refuses the fixed `disqualified_reason` list. Sales Trip endpoints: §6.9.

TODO-*: `GET /api/leads` also filters by `todoListId` and by `todo=1` (on any list) and sorts by `todo_since`; every lead summary carries `todoListId`, `todoList`, `todoSince`.

PD-34, PD-37 (§10.21): every lead summary carries `archiveReasonId` and `archiveReason`. The `quick` parameter of `/api/leads` and `/api/pipeline` takes `quarter_0` … `quarter_3` (the current quarter and the three before it, by first contact date) and `older` (before them); `old_3m` and `quiet` are gone.

PIPE-*: `GET /api/leads` also filters by `stageId`; every lead summary carries `stageId`, `stage`, `stageCode`; `LeadInput.stageId` is optional: on `POST` an absent stage becomes the stage of the BD action, else New Deal (§10.11), and on `PATCH` a BD action from a later stage advances the stage unless `stageId` is sent (`stage_change` entry with `via: bd_action`).

PD-11 (§10.15): `LeadInput.dealValue` and `expectedCloseDate` are optional; every lead summary carries both, and `organizationId` / `personId` (§10.14). `POST /api/leads` also takes `organizationId` and `personId` next to `ownerId`, `opportunityId` and `allowSimilar` (§6.17).

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
| `GET /api/dashboard?scope=mine\|team` | session | `{ today, metrics {calls,emails,visits: {thisWeek,lastWeek}}, followUps {overdue,today,tomorrow}, targets, inactiveLeads, inactivityDays, inactiveLimits {leadId: days}, inactivityRuleCount, clientReplies (MAIL-01: up to 20, §10.2), noNextStep (PIPE-10: up to 20), noNextStepCount, openTasks, overdueTaskCount, recentLeads, teamWide }` |
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
| `GET /api/api-tokens` → `{ tokens }` (everyone's, not revoked; name, prefix, owner, created, expires, last used) · `POST /api/api-tokens` `{ name, expiresInDays: 30\|90\|365\|number\|null }` → 201 `{ token (shown once), apiToken }` (browser session only: 403 to a bearer request) · `DELETE /api/api-tokens/{id}` → `{ ok, apiToken }` (404 when unknown or revoked already) | manage_settings |
| `GET /api/imports/tracker?sheet=` → `{ status: { sheetName, lastImport, history (last 12 runs, `dryRun` flag), unstampedEntries, importedEntries, importedLeads, managers [{ name, email, userId, userName, active, note }] } }` · `POST /api/imports/tracker` (multipart: `file` the .xlsx export, optional `baseline`, `mode` preview\|apply, `sheet`, `keepActionNames`, `force`, `defaultOwner` (account id or email), `owners` (Name=email lines), `archiveSheet`, `clientsSheet`) → `{ report }` (§10.9; a preview is the whole run rolled back). Refusals carry the import's `code`: 400 `needs_baseline` (`unstamped` count), `sheet_missing` (`sheets`), `unreadable`, `no_header`; 409 `already_imported` (`fileHash`, `previous`) and "an import is running already"; 413 beyond 60 MB. One import runs at a time per app instance. | manage_settings |

### 6.8 Gmail (MAIL-01, MAIL-03)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/gmail` | session | `{ configured, connectedEmail, allMailboxes }` (allMailboxes = view_team_reports) |
| `DELETE /api/gmail` | session + same origin | removes the link and its token; audit `gmail.disconnected` |
| `GET /api/gmail/connect` | session | reconnect: sets the shared `leadtrailpro_google_state` cookie with purpose `connect` and redirects to Google consent with `prompt=consent` (same scopes and PKCE as sign-in), so Google issues a fresh refresh token; returns through `/api/auth/google/callback` |
| `GET /api/leads/{id}/emails` | view_leads | `{ emails (newest 25 across mailboxes), failures }` for the lead's `client_emails`; the viewer's mailbox plus every mailbox in which the mailbox watch (§10.2) stored mail for this lead (so a colleague sees the client thread; a reply to such a thread carries In-Reply-To but no foreign thread id), or every connected mailbox for view_team_reports. Each mailbox is queried live (`from:/to:/cc:` search, ten messages per mailbox); a mailbox whose token no longer works counts as a failure instead of breaking the response |
| `POST /api/leads/{id}/emails/send` | log_activities + same origin | `{ to[], cc[], subject, body, attachmentIds[], threadId?, inReplyTo? }`: sends from the signed-in person's connected mailbox through the Gmail API (`features/gmail/send.ts`; MIME built by nodemailer's composer, in-thread when replying, up to ten recipients, the lead's own documents as attachments), then logs an `email` activity with recipients and text; 409 when the mailbox is not connected or did not grant sending |

The mailbox watch (§10.2) is not an endpoint: it runs inside `POST /api/jobs/run` and writes `lead_emails`, the two lead timestamps, Timeline entries, and `email_received` notifications; the lead list, lead page, Action Center, and daily digest read the results. `GET /api/settings` returns `email.watchMailboxes` and `PATCH` accepts it.

Since §10.19 (PD-19, PD-25, built November 16, 2026): `GET /api/leads/{id}/emails` and the mailbox watch use the addresses of every contact of the deal's company, and the deal page's composer gets an Emails tab in place of History → Emails.

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

`GET /api/maps/usage` (`plan_trips` or `manage_settings`) → `{ usage }`: the month's Google Maps units per SKU against the in-app budgets, for the usage card on the planner pages (§10.8).

### 6.10 Notifications, preferences, and jobs (NTF-*, TASK-06)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/notifications?limit=&unread=1` | session | `{ notifications (newest first), unread }` for the signed-in user |
| `PATCH /api/notifications` | session | `{ ids?: number[], all?: true }` → marks read → `{ unread }` |
| `PATCH /api/auth/preferences` | session | `{ dailyDigest, weeklyDigest, emailEvents }` → `{ user }`; audited as `user.preferences_updated` |
| `POST /api/jobs/run` | `X-Jobs-Key` header, or an administrator session | With the key: runs every digest that is due (`{ force?: true, job? }` forces one). With a session: `{ job: daily\|weekly, force: true, onlyMe?: true }` sends that digest to the caller (or everyone when `onlyMe: false`); `{ job: kpi_daily\|kpi_weekly\|kpi_monthly, force: true }` sends that KPI report to the caller (§7.18). → `{ ran: [{ job, periodKey, recipients, failures }], settings }`; 403 otherwise |
| `GET /api/jobs/usage` | view_leads, plan_trips, or manage_settings | `{ usage: JobsUsageOverview }` for the usage card (§7.13): the configured live job sources with this month's calls and credits, budget remainder, HasData's live balance, and the reset date |

Digest runs are audited as `digest.daily` / `digest.weekly` (entity type `job`); KPI report runs as `report.kpi`.

### 6.11 Collaboration messages (COLL-*)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/leads/{id}/messages` | view_leads | `{ threads: [{ root, replies[] }] }`, newest thread first, replies oldest first; removed messages appear with an empty body, `deletedAt`, and `deletedByName` |
| `POST /api/leads/{id}/messages` | collaborate, same origin | `{ body, parentId?, quotedMessageId?, attachmentIds? }` → 201 `{ message }`; 400 when the body is empty or over 10,000 characters, when the thread or quoted message belongs to another lead; attachment ids not on the lead are dropped; audited as `message.posted`; an archived lead rejects posts in the client |
| `PATCH /api/messages/{id}` | collaborate (author only), same origin | `{ body }` → `{ message }` with `editedAt`; 403 for another author; 400 for a removed message; audited as `message.edited` (before and after excerpts); newly mentioned people are notified |
| `DELETE /api/messages/{id}` | moderate_messages, same origin | → `{ message }` marked removed; idempotent; audited as `message.deleted` with the author and full text |

Each message carries `authorName`, `authorRole`, `mentions`, `attachments` (`id`, `fileName`, `label`; download through `/api/attachments/{id}`), `quoted` (`id`, `authorName`, `excerpt`, or "(message removed)"), `editedAt`, `deletedAt`, `deletedByName`, `createdAt`. The lead 360 response (`GET /api/leads/{id}`) adds `messageCount` (live messages) for the tab label.

### 6.12 Task comments (TASK-04)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/tasks/{id}/comments` | session | `{ comments }` oldest first; removed comments carry an empty body, `deletedAt`, `deletedByName` |
| `POST /api/tasks/{id}/comments` | collaborate, same origin | `{ body, attachmentIds? }` → 201 `{ comment }`; ids not on the task's lead are dropped; audited as `task.commented`; notifies mentioned people (`mention`), then the assignee, the creator, and earlier commenters (`task_comment`) |
| `PATCH /api/task-comments/{id}` | collaborate (author only), same origin | `{ body }` → `{ comment }`; audited as `task.comment_edited`; newly mentioned people are notified |
| `DELETE /api/task-comments/{id}` | moderate_messages, same origin | → `{ comment }` marked removed; audited as `task.comment_removed` with the text |

---

### 6.13 Opportunity pool (OPP-*)

| Route | Access | Notes |
|---|---|---|
| `GET /api/opportunities?status=new\|not_relevant\|converted\|attached&page&pageSize&search` | view_leads | `{ opportunities, total, counts }`: one card per company with its listings (newest posting first), the lead it became or feeds, the closed or archived lead it matched (history), the not-relevant reason, the source labels, and for a card from the sales tracker `tracker` (the drafted lead and its entries as date and summary, §10.9); `search` also matches the drafted contact name. Pool order: last seen, then most roles |
| `GET /api/opportunities/{id}` | view_leads | `{ opportunity }` |
| `PATCH /api/opportunities/{id}` | create_leads + same origin | `{ action: "not_relevant", reasonId, note }` (409 unless the card is new; the reason's scope follows its code) or `{ action: "restore" }`; audited `opportunity.not_relevant` / `opportunity.restored` |
| `POST /api/opportunities` | create_leads + same origin | A lead added by hand (§10.25): `{ companyName, website, location, leadSourceId (required), bdActionId, clientResponseId, note, organizationId, personIds }` → 201 `{ opportunity }`. 409 when the company is already a lead or a live deal; 400 when a contact is not the company's. Audited `opportunity.created` |
| `PATCH /api/opportunities/{id}` `{ action: "edit", … }` | create_leads + same origin | The same fields for a lead in the inbox or not relevant (409 once converted); audited `opportunity.updated` with the fields changed |
| `POST /api/opportunities/{id}/reopen` | create_leads + same origin | `{ ownerId }`: for a card with history, reopens that lead (archived → active, closed status → Cold, transfer when the owner differs) and marks the card converted; `{ lead }` |
| `POST /api/leads` with `opportunityId` | create_leads | Creates the lead and, in the same transaction, locks the card and marks it converted (`claimOpportunityForLead`); a card from the sales tracker also hands its drafted timeline entries to the lead in the owner's name and exempts the lead from the historical-date queue; 409 "already assigned to …" when someone else got it first. `allowSimilar: true` accepts a similar-name warning (§7.15) |
| `GET /api/opportunities/searches` · `POST` | view_leads · manage_settings | The shared searches, and `defaults` for a new one (§7.14); `POST { name, titles, postedWithinDays, location, jobType, maxListings, active }` (`parseSearchInput`; since migration 15, a bare `keyword` is read as one title) |
| `PATCH /api/opportunities/searches/{id}` · `DELETE` | manage_settings | Edit or remove a search; audited `opportunity_search.*` |
| `GET /api/opportunities/runs` · `POST` | view_leads · manage_settings | The last 20 runs; `POST {}` runs every active search now and answers `{ run, runs }` |
| `POST /api/jobs/run` (scheduler) | X-Jobs-Key | Also runs the searches once per configured day after the configured time (`runScheduledOpportunities`, claimed through `job_runs` job `opportunities`); the answer's `ran` gains `{ job: "opportunities", periodKey, status, listingsFound, newCompanies, newListings, attached }` |
| `PATCH /api/settings` | manage_settings | `opportunities: { enabled, days[], time, maxListings, notify }` (`normalizeOpportunitySettings`) |


### 6.14 Analytics (RPT-*)

| Route | Access | Notes |
|---|---|---|
| `GET /api/analytics?period&from&to&ownerId&statusId&leadTypeId&cityId&industry&client&source&jobType` | view_reports | The whole screen in one answer (`buildAnalytics`, §7.16): pipeline now by status and owner, status over time, movement, time in status, stalled leads (top 100 of the total), pool totals and runs, breakdowns, leaderboard. Without view_team_reports the owner filter is forced to the viewer |
| `GET /api/analytics/leads?…&status&drillOwnerId` | view_reports | The leads behind a number: the same filters narrowed to a status code and/or an owner (200 newest by activity) |
| `GET /api/analytics/leads?…&stageId` | view_reports | PIPE-12: the drill-down also narrows to one stage (the board's population; a lead never placed counts in New Deal) |
| `GET /api/analytics/team` | view_reports | Team board (`buildTeamBoard`, §7.16): `{ weekStartYmd, rows[] }`, one row per active non-recruiter (only the viewer without view_team_reports): activeLeads, overdueFollowUps, stalled (the Action Center's quiet rule), repliesWaiting (§3.23), this week's calls/emails/visits and leadsCreated, lastActivityAt; sorted by `teamBoardAttention` (replies ×3, overdue ×2, stalled) |
| `GET /api/analytics/team/leads?userId&metric` | view_reports | The leads behind one board number (`teamBoardLeads`; metric active, overdue, stalled, replies; 200 at most); a viewer without view_team_reports gets only their own |
| `GET /api/reports`, `GET /api/reports/drilldown`, `GET /api/reports/export` | as before | Also accept the rolling periods and `period=custom&from&to` (`customRangeFrom`, `periodRange`); a custom range is capped at two years |

### 6.15 Pipeline (PIPE-*, §10.11)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/pipeline` | view_leads | Query: `scope` (mine \| team, default mine), `leadTypeId`, `ownerId` (team), `statusId`, `q`, `pipelineId` (§10.18; default pipeline when absent), and for Show more `stageId` + `offset` → `{ scope, total, stages: [{ id, code, value, sortOrder, active, pipelineId, count, valueTotal (PD-11, every deal in the stage), leads: [card] }] }`. Cards are the active leads whose status is neither Client nor closed, 50 per column, ordered by next step then last activity; a lead with no stage shows in New Deal; an inactive stage is listed only while it holds leads. Card: id, clientName, clientExecutive, city, leadType(Id), status(Id/Code/Label), bdAction(Id), owner(Id/Name), stageId, followUpDate, dealValue, nextTaskDueAt, nextTaskTitle, lastActivityAt, lastClientEmailAt, lastTeamEmailAt, quietDays, quietLimit (§7.9), quiet. Measured on the dev database on November 11, 2026: 0.36 s warm for 3,588 leads on Team, 0.03 s for a search |
| `POST /api/pipeline/recompute` | manage_values | → `{ count }`: every lead placed again from its BD action through the mapping (unmapped action → Contact Made, none → New Deal); no timeline entries; audit `lead.stages_recomputed` |
| `PATCH /api/list-values/{id}` | manage_values | also `stageId` (number or null) on a `bd_action` row: the stage the action lands a lead in; 400 for any other list or an inactive stage |
| `GET /api/pipelines` | session | → `{ pipelines: [{ id, name, sortOrder, active, isDefault }] }` (PD-09, §10.18) |
| `POST /api/pipelines` · `PATCH /api/pipelines/{id}` | manage_values, same origin | `{ name }` → 201 `{ pipeline }`, starting with one stage "New"; `{ name?, active? }` → `{ pipeline }`, the default pipeline stays on; audited as `pipeline.created` / `pipeline.updated`. `POST /api/list-values` takes `pipelineId` for a new `stage` row |

Since §10.19 (built November 16, 2026): `GET /api/pipeline` with `groupBy=status`, `stageId` as a filter, and `firstContactFrom` / `firstContactTo` / `followUpFrom` / `followUpTo`; `POST /api/pipeline/stages`, `PATCH /api/pipeline/stages/<id>` and `DELETE /api/pipeline/stages/<id>?moveTo=<id>` under the new privilege `manage_stages` (Admin and Sales Manager).

### 6.16 Deploys and data corrections (NFR-10, NFR-11, §2.4)

| Method & path | Auth | Request → response |
|---|---|---|
| `GET /api/deploy` | manage_settings | → `{ status: { commit, schemaVersion, agent: { seenAt, repo, branch, remoteCommit, auto } \| null, agentOnline, behind, request \| null, runs: [{ id, commit, status: running\|success\|failed, details, startedAt, finishedAt }] (last ten), failureLog: { runId, commit, at, log } \| null, paused: { pausedById, pausedByName, pausedAt } \| null, waiting } }`. `commit` is the image's `APP_COMMIT` (null for an image built by hand); `agentOnline` means the deployer checked in within five minutes; `behind` means the branch has moved past the running commit; `waiting` means deploys are paused and the branch is ahead (November 13, 2026) |
| `POST /api/deploy` | manage_settings, same origin | "Deploy now": stores the request (`app_settings.deploy_request`), audited as `deploy.requested` → 202 `{ request, status }`. The deployer picks it up on its next check and deploys the branch's commit even when it is the one running or the one that failed |
| `PATCH /api/deploy` | manage_settings, same origin | The pause switch: `{ paused: true }` holds pushes back until a deploy is asked for, `{ paused: false }` lets them go live by themselves again → `{ status }` with `paused` and `waiting`; stored as `app_settings.deploy_pause`, audited as `deploy.paused` / `deploy.resumed`; 400 without a boolean |
| `POST /api/deploy/agent` | `X-Jobs-Key` only | The deployer's channel. `{ event: "poll", repo, branch, remoteCommit, auto }` records the heartbeat (`app_settings.deploy_agent`) → `{ commit, requested, paused }`. `{ event: "start", commit, reason }` opens a `job_runs` row (job `deploy`, period key `<commit 12>-<time>`), clears the request, and closes any run left `running` → `{ runId }`. `{ event: "finish", runId, commit, status: success\|failed, details, log? }` closes the run, keeps a failed run's `log` (the end of the step's output, at most 8,000 characters) in `app_settings.deploy_failure_log`, and is audited as `deploy.finished` → `{ runId }`; 403 without the key |
| `POST /api/admin/sql` | manage_settings, same origin; 403 when `ADMIN_SQL=off` | `{ sql, apply?: true }` → `{ applied, command, rowCount, fields, rows (at most 500), truncated }`. One statement that starts with SELECT, WITH, INSERT, UPDATE, DELETE, or EXPLAIN (leading comments and one closing semicolon are dropped; at most 20,000 characters; anything else 400). It runs through `runStatement` (`lib/db.ts`): a transaction of its own, `statement_timeout` 30 s, the extended protocol (a second command in the text is refused by PostgreSQL with 42601, so the text cannot commit and carry on), `ROLLBACK` unless `apply` is true. A statement PostgreSQL refuses → 400 `{ error, code }` with its message and SQLSTATE. Audited as `admin.sql.preview`, `admin.sql.applied`, or `admin.sql.failed` with the full text in `after_json` |

### 6.17 Contacts (§10.13, §10.14)

| Method and path | Purpose | Privilege |
|---|---|---|
| `GET /api/contacts/people?q=&page=` | People: name, company, first email, phone, the number of deals (all and open), owner, last activity, the most recent deal's id. 50 per page. | `view_leads` |
| `POST /api/contacts/people` | Add a person: `{ name, organizationName, emails, phone, altPhone, remark }`. The company is linked by name, created when the name is new, or left out. 409 when that company already has a person of that name. | `create_leads` |
| `GET /api/contacts/people/<id>` | The person, their deals, the latest 60 timeline entries across those deals, and what the caller may do. | `view_leads` |
| `PATCH /api/contacts/people/<id>` | Name, emails, phones, remark (and the company while the person has none); the values go to every deal of the person. | owner with `edit_leads`, or `edit_any_lead` |
| `DELETE /api/contacts/people/<id>` | Only a person without deals. | as PATCH |
| `GET`, `POST /api/contacts/organizations`; `GET`, `PATCH`, `DELETE /api/contacts/organizations/<id>` | The same for companies: `{ name, website, address, cityId, industry, companySizeId }`; the detail also lists the people. A name is unique without case; an edit goes to every deal of the company; only a company without deals is removed (its people stay, without a company). | as above |
| `POST /api/contacts/people/<id>/activities`, `POST /api/contacts/organizations/<id>/activities` | A note or a logged call, email or visit on the contact itself (§10.16): `{ type, summary, body, occurredAt }` → 201 `{ ok }`, written to `contact_activities`. | `add_notes` for a note, `log_activities` for the rest |
| `POST /api/contacts/people/<id>/merge`, `POST /api/contacts/organizations/<id>/merge` | Folds the record `{ otherId }` into this one and removes it (§10.16) → `{ person }` / `{ organization }`; audited as `person.merged` / `organization.merged`. | edit rights on both |
| `GET /api/contacts/timeline?q=&page=` | The contacts timeline (§10.17): per person, calls, emails, visits and notes per month over the last twelve. | `view_leads` |
| `POST /api/contacts/organizations/lookup` | Add company → Fetch (§10.24): `{ url }` → `{ details: { website, name, industry, address, city, country, description, addressSource } }`, read from the company's website (Google Maps for the address when the site has none). 400 when the address is not a public website or cannot be found; 502 / 504 when the site errs or does not answer. | any signed-in user, same origin |
| `POST /api/leads` with `organizationId`, `personId` | A deal added from a contact's page: the company's other deals do not count as duplicates (the client name must be that company's), and a person without a company joins the deal's. | `create_leads` |

Deals waiting for approval are not counted in the lists; archived deals are.

Since §10.19 (built November 16, 2026): `POST /api/contacts/people` requires a company (migration 27 makes it required); `POST /api/leads` refuses a client or contact name that matches no record with 409 `confirm_create` unless `createOrganization` / `createContact` is `true`; `GET /api/leads/<id>/emails` searches the addresses of every contact of the deal's company.

### 6.18 Sales Trips (PD-39..41, §10.21)

Reading needs `view_leads`; changing needs `plan_trips` and, for an existing trip, being its owner, its creator, or someone with `reassign_leads` (403 otherwise). Every change is same-origin and audited (`visit_trip.created`, `.updated`, `.deleted`, `.deals_added`, `.deal_removed`; entity type `visit_trip`).

| Method & path | Request → response |
|---|---|
| `GET /api/visit-trips` | Query: `q` (trip title; a deal's company, contact, the company's contacts, city, address; a planner trip's address or companies), `ownerId`, `date`, `from`, `to`, `page`, `pageSize` (≤ 200), `recent=1` → `{ trips: [{ kind: visit\|planner, id, title, tripDate, ownerId, ownerName, createdById, createdByName, createdAt, updatedAt, dealCount, companies, address }], total, page, pageSize }`. Both kinds in one list: planner trips (`sales_trips`, visible as in §6.9) have the date of their first planned visit or of the day they were planned, and list their shortlist or every company found. Order: upcoming first (soonest on top), then past (latest first). `recent=1`: newest planned first, at most the number in List of values → Recent Planned Trips (`total` is capped the same way) |
| `POST /api/visit-trips` | `{ title, tripDate, ownerId? (reassign_leads only; others plan their own), leadIds? }` → 201 `{ trip }`. Deals that are not active are skipped |
| `GET /api/visit-trips/{id}` | `{ trip, deals (lead summaries, active only, in visiting order), permissions: { edit } }` |
| `PATCH /api/visit-trips/{id}` | `{ title?, tripDate?, ownerId? (reassign_leads) }` → `{ trip }` |
| `DELETE /api/visit-trips/{id}` | `{ deals: todo\|pipeline\|archive, archiveReasonId? (needed for archive), notes? }` → `{ ok, changed }`. `todo`: each deal back on the list in `from_todo_list_id`; `pipeline`: nothing more; `archive` (needs `archive_leads`): each active deal archived with that reason and notes (§6.4) |
| `POST /api/visit-trips/{id}/deals` | `{ leadIds }` → `{ trip, added }`: added at the end; deals already on the trip or not active are skipped |
| `DELETE /api/visit-trips/{id}/deals?leadId=` | → `{ trip }`: the deal goes back on the list it came from |

A deal added to a trip leaves "To be visited" (a `todo` timeline entry "To Do: removed from To be visited, now on the sales trip … (date)"); a deal sent back gets "To Do: back on …, off the sales trip …". A deal is not sent back while it is on another trip, when it is on another list already, or when it is no longer active.

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

No next step (PIPE-10) = active leads whose status is neither Client nor closed, with no open task and no follow-up date today or later, newest activity first (20 listed, plus the count). Needs-attention limits come from `resolveInactivityDays` with the lead's status, BD action, and stage (PIPE-08). The fifteen queries behind the dashboard are independent and run concurrently on the connection pool (`Promise.all`), as do the count and page queries of the lead list and the ten count and series queries of the performance report (the latter resolves target templates from one `listTargetTemplates` call). The joined lead query plans in about 16 ms on a warm connection, so running these in sequence was what made the Action Center slow once the tracker import brought the lead count to about 3,800. Measured after the change on that data: team dashboard 50–90 ms, lead list 30 ms, search 50 ms, reports 15–60 ms. Bulk loads end with `ANALYZE` so the planner has fresh statistics.

---

### 7.10 Natural-language dates (TASK-03, NOTE-05)

`src/lib/natural-dates.ts` is a dependency-free parser shared by the browser (live preview) and `tests/unit`. `parseNaturalDate(text, { anchor, holidays })` finds the earliest date phrase (a phrase inside a longer one, such as "Feb" inside "Feb 1", is ignored) and resolves it against the anchor calendar date: relative words (today, tomorrow, day after tomorrow, next week/month/quarter/year, end of week/month/year), weekday names, periods ("in two weeks", "six months", "3 business days"), month names alone (first working day of the next such month, year included when given), and explicit dates in several spellings (`Feb 1`, `1st of February 2027`, `Feb/01/2027`, `02/01/2027` month first, `2027-02-01`). Working day = Monday to Friday minus the `business_calendar` holidays. Relative results and month names roll forward to the next working day and report `adjusted`; weekday names move only when they hit a holiday; explicit dates are kept as written. A time of day (`at 10am`, `3:30 pm`, `at 3` = 15:00, `14:45`, noon, morning 09:00, afternoon 14:00, evening 17:00, end of day 17:00) is read from the remaining text.

Client use: `features/tasks/NaturalDateField` shows "Understood “…” as <date> at <time>" and fills the date/time inputs, which stay editable (the confirmation step). It appears in `TaskFormDialog` and in the lead follow-up scheduler. `suggestFollowUp(text, { anchor, today, holidays, person, company })` (NOTE-05) additionally requires a next-step cue in the sentence holding the date (strong: follow up, call back, check in, reach out, touch base, remind, revisit, next step, schedule…; weak: will, need to, should, by, before, due, meet, send… unless the sentence also has a past-tense cue) and a date not before today. The note form uses the interaction date as the anchor, shows the offer with an editable title, date, and time, and sends `followUpTask` with the activity when the offer stays ticked.

### 7.11 Notifications and digests (NTF-*, TASK-06)

PIPE-10 (§10.11): the daily digest carries a "No next step" section (count, then up to six leads with status, stage, and last activity) after Needs attention, and the weekly digest's "This week" line counts them.

`notifyUsers(db, { userIds, actorId, type, title, body, leadId, taskId })` inserts one row per target inside the caller's transaction, never notifies the actor about their own action, and emails targets whose `emailEvents` preference is on when a mail provider is configured (failures are logged, never thrown). Producers: `createTask`/`updateTask` (assignee; creator on completion by someone else), `updateLead` (owner, on status or reason change), `transferLead` (both owners), `createLead` when queued (everyone with `review_queued`), `reviewQueuedLead` (creator and owner), `uploadAttachment` (owner), and the mailbox watch (`features/gmail/watch.ts`, type `email_received` to the lead owner when a client address writes to a connected mailbox, actor null; §10.2), and the job-source usage meter (`recordUsage` → `alertAdministrators`, type `jobs_usage` to administrators at the warning level and at 100% of a source's monthly budget, §7.13).

`runDigestJobs` (`features/notifications/digests.ts`): for each job that `isDigestDue` says is due (business time zone; weekly only on `weeklyDay`), claim `(job, period_key)` in `job_runs`, then for every active non-recruiter user who has not opted out build the digest from `buildDashboard(user, "mine")` and `performanceReport` (yesterday for the daily digest, last week for the weekly one, plus the team report for `view_team_reports`), store it as a notification, and email it. A forced run uses a unique manual period key and may target only the caller. The client polls `GET /api/notifications` every 60 s and after every data change.

### 7.12 Collaboration threads, mentions, and rich text (COLL-*, NOTE-03)

**Rich text** (`lib/richtext.ts`): a Markdown-like subset parsed into blocks (paragraphs, bulleted lists from `-`, `*`, or `•`, numbered lists from `1.` or `1)`) and inline nodes (`**bold**`, `_italic_` or `*italic*` at word boundaries, `[text](https://…)` links, bare `http(s)://` URLs with trailing punctuation left out). Only `http`, `https`, and `mailto` targets become links; anything else stays text. `RichText` (shell) renders the tree as React elements, so user input never reaches the page as HTML. `richTextToPlain` feeds quotes, notification bodies, and emails. The composer toolbar wraps the selection or prefixes lines; it never produces HTML.

**Mentions** (`features/messages/model.ts`): `parseMentions` finds the four groups (`@all`, `@admin`, `@recruiter`, `@salesmanager`, case-insensitive, not inside email addresses) and any active directory name written as `@First Last` (longest name first, so "Sam Sellers" is not read as "Sam Seller"); the result is stored with the message. `mentionRecipients` expands groups to active users by system role. The composer offers suggestions while typing after `@` (keyboard: arrows, Enter or Tab, Escape).

**Notifications**: posting notifies mentioned people (`mention`: "A mentioned you on Lead") and then the lead owner plus every other author in the thread (`message`: "A posted/replied on Lead"), never the actor and never twice. Editing notifies only people newly mentioned. Removal notifies nobody; the audit entry carries the text.

**Live updates (COLL-05)**: the tab refetches the thread list every 20 s and after every change; presence and typing indicators are deferred (PRD open question 15).

**Shared editor** (`features/shell/RichTextArea.tsx`): one controlled textarea with the formatting toolbar, @mention suggestions (when a directory is passed), the file-reference picker (when the lead's attachments are passed), and dictation. Timeline notes and call/email/visit remarks, the collaboration composer, and task comments all use it; timeline bodies render through `RichText`, so pre-existing plain-text notes are unchanged (plain text parses to paragraphs).

**Dictation (NOTE-04)**: the editor looks for `SpeechRecognition` / `webkitSpeechRecognition` after mount and shows the microphone only when present (Chrome, Edge, Safari; not Firefox). Recognition runs continuously with interim results in the user's browser language; each final phrase is inserted at the cursor (with a leading space when needed), interim text and errors (microphone blocked, no microphone, service unreachable) appear in a live region under the textarea, and nothing is saved until the user submits. Browsers require a secure context (HTTPS or localhost) for the microphone. No audio reaches the application server; Chrome and Edge send it to the vendor's speech service, Safari to Apple's.

### 7.13 Job-listing sources (TRIP-06, OPP-01; usage meter NFR-12) — as built October 26, 2026

The Hiring column and the listings dialog draw on several sources combined behind one lookup (`features/jobs/repository.ts: getCompanyJobs`), decided after the HasData review (§10.8) and the alternatives check (PRD open question 10):

1. **Cache first.** The company name is normalised (§10.8 rules) and the freshest `job_listing_cache` row younger than `cacheHours` (default 24) answers without any call. A company that appears in several trips, or that the Opportunity module searched, costs nothing the second time. `force` bypasses the cache.
2. **Waterfall in the configured order.** Sources are tried in `order` (default Adzuna → JSearch → HasData → custom → sample), skipping any that is not configured (no key), switched off, or over its daily or monthly budget (`eligibleSources`). The first source that answers wins, even with an empty list; a failing call (timeout, non-2xx, 429) counts as a failure and the next source is tried. Nothing answering leaves the count unknown with a reason. With the sample trip provider (`TRIPS_PROVIDER=stub`) the sample source is moved to the front (`orderForSampleCompanies`), because every company is fictional and a live call would only spend budget; the first source that answers wins, even with an empty list.
3. **Budgets and pacing.** `job_source_usage` counts calls and failures per source and day; defaults fit the free tiers (Adzuna 200 a day, JSearch 10 a day and 180 a month, HasData 50 a day and 90 a month). Calls to one source are serialised in-process with a minimum gap (Adzuna 2.5 s for its 25-a-minute limit, JSearch 1 s, HasData 0.3 s), so the trip planner's four workers cannot trip a rate limit.
4. **Fetch less.** A new or re-run trip looks up only the nearest `prefetch` companies (default 20, 0–50); the others show **Check** in the Hiring column, and opening the dialog fetches them on demand (`resultJobs`), which refreshes the row. Opening a company whose listings are older than `cacheHours` refreshes them.
5. **Company match.** Every adapter keeps only listings whose company, normalised, equals or extends the one asked about (`keepCompanyListings`), because the sources search by keyword and neighbours slip in.

**Adapters** (`features/jobs/sources/`, each a pure `mapX(data, companyName, normalize)` plus a `createXSource(config)` so the mapping is unit-tested without network): `adzuna` (`GET https://api.adzuna.com/v1/api/jobs/{country}/search/1?app_id&app_key&what_phrase=<company>&where&max_days_old=30&results_per_page=50`, the response narrowed to the company by `keepCompanyListings`; `created` → date, `contract_time`/`contract_type` → employment type, `redirect_url` → link; attribution "Jobs by Adzuna" in the dialog), `jsearch` (`GET https://jsearch.p.rapidapi.com/search?query=<company> jobs in <city>&country&date_posted=month`, headers `x-rapidapi-key`/`x-rapidapi-host`; `job_publisher` → source, `job_employment_type` → type, `job_apply_link` → link), `hasdata` (the §10.8 design: `GET https://api.hasdata.com/scrape/indeed/listing?keyword=<company>&location=<city>&datePosted=14[&domain]`, `domain` expanded to the Indeed host by `hasDataDomain`, header `x-api-key`; `details[]` → type, `isoDate` → date; source "Indeed"), `generic` (the original JSON contract: `GET ${JOBS_API_URL}?company=&website=&location=` with `Authorization: Bearer`), `stub` (the sample listings of the stub trip provider; on when `TRIPS_PROVIDER=stub` or `JOBS_SOURCES=stub`). Keys are read from the environment on every lookup and never leave the server. `TripProvider` (§10.8) no longer carries job listings; it only geocodes and finds companies.

**Settings (Admin → Settings → Job listing sources).** Each source shows whether it is ready or why not (missing key, switched off, budget spent), an enabled switch, daily and monthly budgets, today's and this month's calls and failures, and up/down buttons for the order; plus cache hours and the prefetch count. Saved in the `job_sources` setting, audited.

**Checked with live free keys on November 1, 2026:** Adzuna's `company` filter is unreliable (nothing for one company that has listings, an HTML 400 page for another) while `what_phrase=<company>` returned every listing of the company, so the adapter uses the phrase search plus the client-side company match; a new Adzuna application is "pending activation" (5 calls a minute, 25 a day and a month) until Adzuna reviews it, so the Admin should lower its budget under Settings → Job sources meanwhile. HasData validates `domain` against full Indeed host names and rejected `ca` with a 422, hence `hasDataDomain`; a broad query returned 25 Indeed listings, a company-name query for a company with no Indeed postings returned `error: "Indeed hasn't returned any jobs for this query"` with status `ok`. Still open: JSearch precision for small companies (no key yet), and Canadian coverage on ten known hiring companies once the Maps key gives real company results; `npm run jobs:test -- "<company>" <city>` runs every configured adapter for one company from the command line (one call per source). The Opportunity module (§10.10) will call the same adapters through a `searchListings` method (keyword and location, paged), not yet written.

**Usage meter (November 7, 2026).** `jobSourceCreditsPerCall` (HasData 10) turns the per-source call counters into credits; `fetchHasDataUsage` reads HasData's free `GET /user/me/usage` (`parseHasDataUsage` → `{ totalCredits, availableCredits, checkedAt }`), cached a minute per app instance (`hasDataAccount`) and shown in Settings → Job listing sources and on the usage card; `HASDATA_API_URI` points the adapter at a stand-in. `recordUsage` now ends with `alertAdministrators`: when a source's monthly calls reach `jobSources.warnAtPercent` (default 80) or 100% of its monthly budget, one `jobs_usage` notification goes to every active administrator, claimed through `job_runs` as `jobs:<source>:<percent>` per `YYYY-MM`. `GET /api/jobs/usage` (`jobsUsageOverview`: configured live sources only, each `jobsUsageSource` with percent, remaining calls, credits this month, the balance, and `callsLeft` = budget remainder capped by the balance) feeds `JobsUsageCard`, shown on Opportunities and the planner pages for anyone with view_leads, plan_trips, or manage_settings. Unit tests in `tests/unit/jobs-usage.test.mjs`; the balance call was verified live on November 7, 2026 (`npm run jobs:test -- --balance`).

### 7.14 Opportunity pool (OPP-*) — as built November 6, 2026

Decided with the project owner on November 6, 2026 in place of the BRD's per-Sales-Manager search terms: one shared pool. The run (`features/opportunities/runner.ts`, `runOpportunitySearches`) takes every active search and sends it to every job source that is enabled and within budget (`eligibleSources`, the stub first when `TRIPS_PROVIDER=stub`), page by page through the adapter's `searchListings` (§7.13) until the cap per search and source (`max_listings`, else the Settings default), checking the budget before each page and counting each page as one call in `job_source_usage`; one failing source does not stop the others, and the notes go into the run's details. Listings are grouped by `normalizeCompanyName` (`groupByCompany`) and deduped on `listingKey`. For each company the CRM match (`matchLead` on name and location against `listMatchableLeads`) and the existing card decide (`decideCompany`, pure): a live lead or client (not archived, not lost or disqualified) takes the listings (card `attached`, or still `converted` when it is the lead the card became; listings get `lead_id`; the timeline receives up to five `listing` entries with `touch: false` so they do not count as activity, and the owner gets a `listing_found` notification); a not-relevant card stays hidden for a company-level reason and comes back for a role-level one only when a listing not seen before arrives; otherwise the company is in the pool as `new`, with `matched_lead_id` pointing at a closed or archived lead as history and `revived` when it returns after an earlier outcome. A posting seen again only refreshes `last_seen_at`. After the run: per-search counters, an `opportunity_runs` row, audit `opportunities.run`, and, when new companies arrived and the setting allows, an `opportunities_found` notification to everyone who may create leads. The schedule (`OpportunitySettings`: days of the week, time, cap, notify) is checked every minute by the scheduler through `isOpportunityRunDue`, once per day through `job_runs`.

**Search definition (November 7, 2026).** HasData's Indeed endpoint takes one `keyword` and one `location` per call (no lists, no radius, no job-type filter; 10 credits a call), so a search holds a group of up to ten job titles that `indeedKeyword` turns into one query (Indeed's own OR syntax, multi-word titles quoted), one location (a city, region, or province), and `posted_within_days` (1 to 90), which every adapter receives as `SearchListingsInput.postedWithinDays` (HasData `datePosted`, Adzuna `max_days_old`, JSearch `date_posted` through `jsearchDatePosted`, the generic source `days`). HasData accepts only 1, 3, 7, or 14 for `datePosted` and answers 422 to anything else (found on November 11, 2026 when the first server search, 30 days, failed), so `hasDataDatePosted` rounds the window down to the nearest of those: a 30-day search looks back 14 days on Indeed, which the Posted within hints say. `settings.opportunities.defaultTitles` / `defaultLocation` / `postedWithinDays` (Settings → Opportunity searches; defaults five industrial titles, "Ontario", 30) pre-fill a new search through `GET /api/opportunities/searches` → `defaults`. `parseSearchInput` still accepts a bare `keyword` from an older client as a single title; rows saved before migration 15 read their keyword as the single title.

Actions: **Assign as lead** opens `LeadFormDialog` pre-filled (company, location, the roles as positions, the listing links in comments; for a tracker card every field the sheet knew, with the named status, lead type, city, BD action, and response resolved to list values) with the owner to choose (anyone who may reassign, which every Sales Manager now may); saving calls `POST /api/leads` with `opportunityId`, and the card is locked and converted inside the lead's transaction so two people cannot both take it. **Reopen lead** on a card with history restores the earlier lead instead (§6.13). **Not relevant** needs a reason from the `opportunity_reason` list (scope by code: `position_not_relevant` is role-level, the rest company-level) and an optional note; **Back to the pool** reverses it. Administrators keep the searches and see the run history on the same screen and start a run with **Run searches now**. The navigation badge counts the pool.

### 7.15 Duplicate guard on lead creation (LEAD-01, decided November 6, 2026)

`createLead` runs `findDuplicateLead` before inserting: a lead whose client email equals one of the new lead's, or that `matchLead` (§7.13 rules) finds on website domain, phone number, exact name with address, or exact name, or whose normalised company name equals the new one regardless of city, is an exact duplicate; a very similar name at the same address is similar; any match on an archived lead counts as similar. An exact duplicate answers 409 with `{ duplicate: { leadId, clientName, ownerId, ownerName, statusLabel, recordState, matchedOn }, canOverride: false }` and the message names the lead and its owner (transfer is the way to take it over); a similar one answers 409 with `canOverride: true`, and the form offers **Open <lead>** and **Save anyway**, which resends with `allowSimilar: true` and records the override in the `lead.created` audit entry. The same guard protects every path that creates leads (form, pool, API).


### 7.16 Analytics (RPT-*) — as built November 6, 2026

Periods (`lib/dates.ts`): the calendar periods plus rolling windows (`last_24h` runs to the current instant, `last_7d`, `last_30d`, `last_90d`, `last_12m`) and `custom` (inclusive `from`/`to`, capped at 731 days). Filters (`AnalyticsFilters`, `leadFilterSql`): owner, status, lead type, city, industry and client as case-insensitive text matches, source (`pool` = a lead created or fed from an opportunity card, `other`), job type (a listing of the lead whose employment type matches); archived leads are never counted. One call (`buildAnalytics`) loads the filtered leads and their `created` and `status_change` timeline entries, then computes in memory (pure rules in `features/analytics/model.ts`): **pipeline now** (counts by status and by owner); **status over time** (buckets of days up to a month, weeks up to half a year, months beyond; a lead counts from its creation with its last status before the bucket end); **movement** in the period (`summarizeTransitions`: what each status received, the cold → warm → hot → client steps, conversions from anywhere, moves backwards by status rank, lost and disqualified reasons from the change's `toReason`), also per owner; **time in status** (completed stays that ended in the period, median and 75th percentile per open status); **stalled leads** (`stalledAssessment`: active, not closed, not client; days in the current status and days since activity against the needs-attention rules of Settings resolved per status and BD action, a follow-up overdue, a hot lead quiet for more than a week; worst first, the top 100 returned with the total); **opportunity pool** (runs in the period, cards assigned or marked not relevant in the period, cards attached to leads, the median hours from first seen to assigned, companies and assignments by employment type); **breakdowns** of the current leads by industry, city, and lead type with their client counts, and the ten leads with the most activities; a **leaderboard** per active salesperson (leads created, conversions, activities, overdue follow-ups, opportunities taken). On the screen (`features/analytics/AnalyticsSections.tsx` under `ReportsPage`, Recharts on the validated palette: fixed status hues, 2px surface gaps, one axis, a legend for two or more series, a table or direct numbers beside every chart) the status tiles and owner bars open the leads behind them, the stalled table opens the lead and exports CSV, and the existing performance table keeps its drill-downs and PDF/Excel/CSV exports. A weekly stalled-leads email to administrators (`features/analytics/report-email.ts`, job `stalled_report` on the weekly summary day and time, claimed through `job_runs`) exists behind `settings.email.reportEmails`, off by default.

**Team board (RPT-02, November 7, 2026).** The first section of Analytics for team-report viewers (`TeamBoardSection` in `AnalyticsSections.tsx`): per salesperson, as things stand now, active leads, overdue follow-ups, stalled leads (quiet longer than the TASK-05 rules allow, the same rule as the Action Center), client replies waiting (§3.23), this week's calls, emails, visits and leads created (from Monday in the business time zone), and the person's last timeline entry; rows sorted by `teamBoardAttention`. Each count opens the shared drill-down dialog (`drillWith`) with the leads behind it, from which the lead opens for a comment, a task, or a reassignment. Data from `GET /api/analytics/team` and `/team/leads` (§6).

### 7.17 Email through the Google app and the end of passwords — as built November 6, 2026

Decided by the project owner: no SMTP, no stored passwords. `MAIL_PROVIDER=gmail` (the default when the OAuth client is configured) sends every message through the Gmail API from the mailbox chosen under Settings → Email delivery (`settings.email.senderUserId`, one of the users with a `gmail_connections` row; `listSenderMailboxes`), building MIME with nodemailer's composer and posting it to `users.messages.send` with that user's refresh token (`sendFromMailbox`). The consent at sign-in asks for `gmail.send` next to `gmail.readonly`; a mailbox that granted only reading gets a 409 asking to reconnect. `isMailerConfigured()` stays synchronous through `lib/mail-state.ts`, which remembers whether a sender is chosen. The weekly report email is the only mail behind a switch (`settings.email.reportEmails`); notifications and the summary emails follow their existing settings. Wherever a Google client exists (`passwordSignInEnabled()` false): the sign-in screen is Google only, `POST /api/auth/login`, forgot-password, reset-password, two-factor, change-password, set-password, and the set-password email answer 403, User management hides the password fields and the two-factor switch, accounts are created without a password (`users.password_hash` nullable since migration 12; the seed file has no password column), and the two seeded accounts had their hashes cleared. The password path stays whole for stacks without a client, which the browser suite relies on.

### 7.18 KPI report emails to administrators (RPT-07) — as built November 10, 2026, reworked November 12, 2026

Asked for by the client on November 9, 2026: a daily, weekly, and monthly Sales Manager performance report plus the system-wide picture, emailed to the administrators. `features/reports/kpi-model.ts` holds the pure rules and `kpi-email.ts` the data and the sending. The first real emails (November 11 and 12, 2026) put the previous working day's numbers, all zero, next to the current ones in one table, which the project owner read as a contradiction; since then every report leads with the current state and nothing else shares its table. That table has one row per active Sales Manager, and per anyone else who owns a lead (an administrator, or an account since switched off, marked "(inactive)"), so the totals row covers every lead that is neither archived nor deleted: the number of leads, one column per status of the status list that any lead has (one query grouped by owner and status), and what is waiting on the person from the team board (§7.16: overdue follow-ups, stalled leads, client replies waiting; `buildTeamBoard` takes the list of people for this). Administrators who own no lead are not listed. Below it comes the pipeline by stage (PIPE-12). The daily report ends there. The weekly and monthly reports (`kpiActivityPeriod`: last week, last month; §7.8) add a second table from the performance report (§6.6: leads created and updated, calls, emails, visits, notes, conversions, tasks done, target %) with only the people who recorded something in the period and a totals row (counts summed, target % averaged over everyone who has a target), or one sentence when nothing was recorded. The subject and the first line carry the moment the numbers were read, in the business time zone ("as of 2026-11-12 07:30"). It is sent as text and HTML to every active user with `manage_settings`, from the sending mailbox. Schedule, in the business time zone and riding on the digest times under Settings → Summary emails: daily on business days (no weekends or holidays) at the daily digest time, weekly on the weekly digest day at its time, monthly on the first day of the month at the daily time; the digests' own switch does not apply, the three KPI switches under Settings → Email delivery do (`email.kpiReports`, all on by default). `runKpiReports` runs from `POST /api/jobs/run` every minute, claims `(kpi_daily | kpi_weekly | kpi_monthly, period key)` in `job_runs` so each report goes once per period, makes no claim while no mail delivery is configured (the period is still sent once a mailbox is chosen that day), and audits each run as `report.kpi`. "Send me the … KPI report" under Settings sends one to the caller at once (`{ job: kpi_daily, force: true }`).

## 8. Client application design

> **Since November 13, 2026** the shell, the navigation and the way a deal opens are those of §10.13 (the new layout: dark menu, Deals page with its view switch, the deal as a page, quick add), and Contacts are §10.14, §10.16 and §10.17. The description below is the earlier design; where the two differ, §10.13 and later hold. Component names in the code: `AppShell` (routes and aliases), `DealsPage`, `PipelinePage` (the board), `LeadListPage` (the lists), `DealPage` (replaces the lead dialog), `ContactsPage`, `ContactPage`, `ContactsTimeline`, `ReleasesCard`.

### 8.1 Shell

- `src/app/page.tsx` renders `App`: checks `/api/auth/session`; shows `AuthScreen` (login with a password or Sign in with Google, 2FA code, forgot, reset, first-time setup) or `AppShell`.
- `AppShell` loads `/api/reference` once, provides `AppContext` (`user`, `reference`, `notify`, `navigate`, `openLead`, `openNewLead`, `can`, `roleLabel`, `dataVersion/bumpData`), renders the sidebar (items filtered by privilege, counts for queued leads and open tasks), topbar (global lead search, profile menu), the current view, the lead detail dialog, the new-lead dialog, and toasts.
- Routing: URL hash `#/<view>[/<param>][?query]` (`useHashRoute`). Views: `home`, `leads`, `all-leads`, `cold`, `warm`, `hot`, `client`, `queued`, `archive`, `lead/<id>`, `tasks[/<id>]`, `reports`, `targets`, `admin`, `values`, `settings`, `devices`, `lead-generation` (the job searches' leads), `lead-discovery` (preview), `planner`, `trips`, `trips/<id>` (Sales Trip Planner). Lead lists are keyed by view + query so navigation resets filters.
- Data loading: `useAsyncData(fetcher, refreshKey)` — memoized fetcher, derived `loading`, `reload()`, no synchronous state writes inside effects (satisfies the React Compiler lint rules). After any mutation, `bumpData()` refreshes lists and counts.
- Permissions in the UI mirror the server: buttons and navigation items render only when `can(privilege)`; the server remains authoritative.

### 8.2 Feature modules

| Folder | Components |
|---|---|
| `features/auth` | `AuthScreen`, `ChangePasswordDialog` |
| `features/dashboard` | `ActionCenter` |
| `features/gmail` | `LeadEmails` (Emails tab: configuration note, connect/disconnect, recent messages), `client.ts`, server `gmail.ts` (OAuth exchange, token encryption, Gmail search) |
| `features/leads` | `LeadListPage` (toolbar with status and reason filters, filters panel, bulk bar, pagination), `LeadTable` (Stage column), `LeadFormDialog` (all fields; reason select for closed statuses; Pipeline stage, New Deal by default), `LeadDetailDialog` (Overview, Timeline, Collaboration, Emails, Documents, Profiles shared, Tasks, Audit tabs; transfer, archive/restore, approve/reject, schedule follow-up, quick BD action/stage/response/status updates, `StatusReasonDialog` for Lost Lead and Disqualified, inline reason select). Since November 13, 2026 `DealsPage` (the view switch) and `DealPage` (the deal as a page) replace the lead pages' entry points and `LeadDetailDialog` (§10.13); `deal-value.ts` (PD-11) and `todo-model.ts` (TODO-*) hold pure rules |
| `features/tasks` | `TasksPage` (Overdue / Today / Upcoming / Done columns, mine/team, comment counts), `TaskFormDialog` (lead search, assignee, typed or picked due date, priority, checklist; `TaskComments` below the form of an existing task), `TaskComments` (list, composer with mentions and file references, edit own, Admin removal), `NaturalDateField` (TASK-03 preview), server `comments.ts` |
| `features/reports` | `ReportsPage` (period chips, person, stage, and template filters, stat tiles, daily stacked bars, performance table with drill-down dialog, Excel and PDF export links via `/api/reports/export`, CSV export) |
| `features/admin` | `AdminPage` router, `UsersPanel` (+ `UserFormDialog`, password dialog, terminate dialog, login history), `ListValuesPanel` (plus the Stage column and Recompute stages on the BD action list, PIPE-03), `TargetsPanel`, `SettingsPanel` (role names, reminder days and needs-attention rules by status, BD action, or stage, Pipeline next steps per stage with the prompt and automatic switches, digest schedule with send-now buttons, business-calendar holidays, email delivery mode and outbox), `ApiTokensPanel` (API access: token list with owner, expiry, last use; create dialog that shows the token once with usage lines; revoke), device placeholder, `sql-model.ts` (the statement rules of `POST /api/admin/sql`, §6.16) |
| `features/tracker-import` | `TrackerImportPanel` (Administration → Tracker import: upload form with sheet, default owner, Sales Manager mappings, keep-action-names, baseline when needed, force after a refusal, other sheets; Preview then Apply with a confirmation; the report as count tiles and collapsible sections with a download; status panel with previous runs, the Sales Manager accounts, and the remote commands), `model.ts` (types, multipart option parsing, count ordering), `service.ts` (status queries; the shared import inside one transaction, rolled back for a preview, one at a time), `client.ts` |
| `features/users` | `UserDirectoryDialog` (person picker); server `session.ts` (cookie and bearer authentication), `api-token-model.ts` (browser-safe token rules), `api-tokens.ts` (generation and hashing), `api-token-repository.ts` |
| `features/notifications` | `NotificationsMenu` (top-bar bell: unread badge, dropdown, mark read, open lead or task, expand digests), `PreferencesDialog` (profile menu → Notification preferences), `digests.ts`, `repository.ts`, `model.ts` |
| `features/messages` | `CollaborationTab` (composer with formatting toolbar, @mention picker, file references; threads with Reply, Quote, Edit, Remove), `client.ts`, server `repository.ts` (threads, post, edit, remove, notifications, audit), `model.ts` (input validation, mention parsing and recipients) |
| `features/preview` | `LeadGenerationPage`, `PlannerPage` (labelled previews) |
| `features/trips` | `TripsPage` (new-trip form with the six criteria of TRIP-01, list of trips), `TripResultsPage` (sortable columns, Action filter, Show selector for all / shortlisted / planned visits, shortlist checkboxes, planned-visit dates, job-listings dialog with Check for companies not yet looked up, Excel export link, print), `matching.ts` (TRIP-07 rules), `providers/` (`types`, `stub`, `google`, selector; company data only) |
| `features/pipeline` | `PipelinePage` (the board, §10.11: Mine / Team toggle, search, status filter, lead type and owner filters, the undo bar, one column per stage with its count and Show more, cards with drag-and-drop and the Move to… select; a card opens `LeadDetailDialog`, the deal page since §10.13; the next-step prompt after a move), `StageBar` (PIPE-11: the stages across the top of the lead page, the current one highlighted, a click moves the lead after a confirmation), `NextStepDialog` (PIPE-09: type, title, typed or picked due date, assignee, follow-up date switch; Skip), `model.ts` (pure rules: the stage of a BD action, the forward-only advance, filter parsing, next step of a card, quiet days, card order, `defaultNextStep` from Settings → Pipeline), `repository.ts` (the board query), server `follow-up.ts` (`createStageFollowUp` when the automatic switch is on), `pipelines.ts` (several pipelines, §10.18), `client.ts` |
| `features/opportunities` | `OpportunitiesPage` (tabs Pool, Not relevant, Assigned as leads, Existing leads, and Searches & runs for administrators; filter; expandable roles; Assign as lead → `LeadFormDialog` with `prefill` and `opportunityId`; Reopen lead; Not relevant dialog with reason and note), `model.ts` (pure rules: schedule, `decideCompany`, grouping, keys), `repository.ts`, `runner.ts`, `claim.ts`, `client.ts` |
| `features/jobs` | `JobsUsageCard` and `client.ts` (usage card, November 7, 2026); server `model.ts` (source ids, settings, routing rules), `repository.ts` (cache, waterfall, budgets, pacing, statuses), `sources/` (Adzuna, JSearch, HasData, custom JSON, stub adapters) — §7.13 |
| `features/maps` | `MapsUsageCard`, `client.ts`; server `model.ts` (SKUs, budgets, levels), `repository.ts` (the meter, alerts) — §10.8 |
| `features/analytics` | `AnalyticsSections`, `charts.tsx` (Recharts) under `ReportsPage`; `model.ts` (pure rules), `repository.ts`, `report-email.ts` — §7.16 |
| `features/contacts` | `ContactsPage` (People, Companies, Timeline), `ContactPage`, `ContactFormDialogs`, `ContactsTimeline`; `model.ts`, `repository.ts`, `sync.ts`, `client.ts` — §6.17, §10.14, §10.16, §10.17 |
| `features/deploy` | `ReleasesCard` (Settings → Releases: what runs, the pause switch, Deploy now); `model.ts`, `repository.ts`, `client.ts` — §2.4, §6.16 |
| `features/shell` | `App`, `AppShell`, `AppContext`, shared `Dialog`, `Tabs`, `Field`, `Pagination`, `PromptDialog`, `Avatar`, `StatusPill`, `EmptyState`, `RichText` (NOTE-03 renderer), `RichTextArea` (editor with toolbar, mentions, file references, dictation) |

### 8.3 Styling

Hand-written CSS in `globals.css` (existing design system: 10–13 px type, `#586be3` primary, `.panel`, `.button*`, `.lead-table`, `.status-pill.status-<code>`, `.avatar-<tone>`), plus an appended section for filters, dialogs, timeline, tasks, reports, and admin. Breakpoints at 1500, 1180, 900, and 640 px; the sidebar collapses to icons and becomes a drawer on mobile (NAV-01).

---

## 9. Screen designs (BRD Appendix A) and as-built mapping

> **Since November 13, 2026** the screens follow the new layout and names (§10.13 onward): what this section calls a lead is a **deal**, an opportunity is a **lead**, the lead detail dialog is the **deal page**, Tasks & reminders is **Activities**, Analytics is **Insights**, and the sidebar entries My / All / Cold / Warm / Hot leads, Clients, Queued and Archive are views of the **Deals** page. The mapping below is kept for the BRD references and the rules behind each screen, which did not change.

### A1. Login / Authentication — implemented (device policy planned; Google sign-in built November 5, 2026, §10.1)

```
+--------------------------------------------------------------+
| SALES TRACKER                                                |
| Email [________________________]                              |
| Password [____________________]  [Forgot Password]            |
| [ Sign In ]                 [ Sign in with Google ]          |
|--------------------------------------------------------------|
| If 2FA enabled: OTP [______] [Verify] [Resend]                |
| Authorized company device required when device policy active |
+--------------------------------------------------------------+
```
As built: email/password, "Forgot your password?", first-time setup link (only while no account exists), 2FA code step, reset-password form reached from the emailed link. Since November 5–6, 2026, wherever a Google client is configured, the screen shows only "Sign in with Google" and the password features are off (§4, §7.17); the password form remains for stacks without a client.

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
As built: three metric cards plus a target card; Overdue/Today/Tomorrow tabs; targets panel; "Client replies waiting", "Needs attention", "No next step" (PIPE-10), and "Open tasks" panels; recent leads table; team scope toggle for admins.

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
As built: the Emails tab lists the newest messages with the deal's client addresses, live from the connected mailboxes, with Send email and Reply through the person's own mailbox (November 6, 2026, §6.8, §7.17); the mailbox watch flags client replies (§10.2). Forward, the AI summary and follow-up suggestions are planned. Planned (§10.19, PD-19, PD-25): the company's mail in an Emails tab of the deal page's composer.

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

### A8. Lead Discovery (formerly Lead Generation) — preview page (planned, §10.4)

```
+---------------------------------------------------------------------+
| LEAD DISCOVERY                                                      |
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

### 10.1 Google sign-in (AUTH-03) — built November 5, 2026
As built (details in the §3 authentication table): authorization-code flow with PKCE through `/api/auth/google` and the callback `/api/auth/google/callback` shared with Gmail linking, identity plus read-only Gmail in one consent (the project owner's decision of November 5, 2026, so every user's mailbox link exists from the first sign-in), the verified Google email matched to an active `users` row, no auto-provisioning (AUTH-01), and the ordinary session afterwards. Not built from the original design: the `user_identities(user_id, provider, subject)` table; the Google subject id is not stored, so an account is identified by its email alone. The accounts themselves come from `seed/accounts.csv` (§2) or Admin → Users. Verified on November 5, 2026 against a local stand-in for Google's authorization and token endpoints (`GOOGLE_AUTH_URI`/`GOOGLE_TOKEN_URI`): state and PKCE enforced, forged state and unverified email refused, a registered account signed in with its mailbox token stored, a returning sign-in kept it, an unticked Gmail box signed in without it, the reconnect flow replaced it, an unknown email refused with no row created. Google Cloud console: the callback URI was registered on November 5, 2026 and the consent screen was published on November 6, 2026 (External, unverified), so test users are no longer needed; the Gmail API must be enabled on the project.

### 10.2 Gmail integration (MAIL-*)
As built (§6.8): per-user read-only Gmail link with the refresh token encrypted in `gmail_connections`; the Emails tab queries Gmail live for the lead's client addresses and lists the newest messages with body text; Send and Reply from the person's own mailbox (§7.17). **Mailbox watch, built November 7, 2026** (`features/gmail/watch-model.ts` pure rules, `watch.ts` database and Gmail calls, run from `POST /api/jobs/run`): one scan per five-minute slot claimed in `job_runs` as `mailbox_watch` / `watchPeriodKey`, skipped when Gmail is not configured or `settings.email.watchMailboxes` is off. Per active user's connection: `users.messages.list` with `after:<watermark seconds> -in:drafts -in:chats -in:spam -in:trash` (first scan `newer_than:30d`), newest first, up to 5 pages of 100; ids already in `lead_emails` for that mailbox are skipped; each other message is read with `format=metadata` (From, To, Cc, Subject) and its outside addresses (everyone except users' emails and connected mailboxes) are matched against active leads' `client_emails` (text search, then exact check). A match stores a `lead_emails` row per lead, sets `last_client_email_at` when the sender is a client address or `last_team_email_at` when the mailbox sent it, adds a Timeline `email` entry for received mail with `touch: false` (not sales activity) and `meta.gmail`, and after the first scan notifies the lead owner (`email_received`). The watermark becomes the newest internal date seen, or the oldest of the scan when the page cap was hit so the next scan continues. A mailbox whose token fails counts as a failure and does not stop the others. Surfaces: Action Center panel "Client replies waiting" (`Dashboard.clientReplies`, newest first, 20), daily digest section, lead list badge and sort `client_reply` (NULLS LAST), lead page "Client last email". `GMAIL_API_URI` points every Gmail call at a stand-in for tests. Still planned, as designed below: stored bodies and threads, owner-mailbox association on transfer, forward, and summaries. Since November 5, 2026 the mailbox consent is part of the first Sign in with Google sign-in (§3 authentication table, §10.1); the Emails tab's Connect button renews it. Planned (§10.19, PD-19, not built): the watch and the Emails tab match the addresses of every contact of the deal's company, not only the deal's own.

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

**Providers behind interfaces** in `features/trips/providers/`: `geocode(address)`, `searchCompanies({ lat, lng, radiusKm | driveMinutes, businessType, limit })`, `distances(origin, targets)` (and an isochrone or distance-matrix call for driving minutes), `jobs({ companyName, website, location })`. First implementation under `MAPS_API_KEY` (`providers/google.ts`, moved to the current services on November 4, 2026 because the legacy Places and Distance Matrix endpoints cannot be enabled on Cloud projects created after October 2026): Geocoding API for the trip address; Places API (New) `places:searchText` with the keyword rules per business type, a circular `locationBias` of the radius (50 km at most), up to three pages of 20, and a field mask that includes `websiteUri` and `nationalPhoneNumber` so website and phone arrive with the search (an Enterprise-SKU call per page, cheaper than one Place Details call per company); Routes API `computeRouteMatrix` (one origin, up to 100 destinations per call, `TRAFFIC_UNAWARE`, durations like `"1530s"` read by `destinationIndex`) for driving minutes; closed places and places without coordinates are dropped. The mappers `mapPlacesSearch` and `mapRouteMatrix` are pure and covered by `tests/unit/trip-google.test.mjs`; `npm run maps:test -- "<address>"` runs the three live calls, and a refusal names the API that is not enabled; a licensed job aggregator under `JOBS_API_URL`/`JOBS_API_KEY` (PRD open question 10); `TRIPS_PROVIDER=stub` serves a fixed catalogue of fourteen companies around Mississauga and Toronto (with websites, phones, and listings) for development and tests. Without keys and without the stub the page reports "not configured" the way Gmail and SMTP do. The Google adapter's live calls were run with the project's real key on November 6, 2026 (`npm run maps:test`, then a trip created and re-run through the running app): the first live run showed that the Geocoding API, a legacy web service, ignores the `X-Goog-Api-Key` header and needs the key as the `key` query parameter (fixed; Places API (New) and Routes accept the header); all three services then answered and the usage meter counted one geocode, one places page per search, and one route element per company. Provider terms limit how long place data may be cached, so results keep the place id and refresh fields on re-run. Job listings are fetched for every result when the trip is created or re-run (four at a time) so the Hiring column shows counts at once; the dialog re-fetches a company's listings when they are older than a day. The aggregator contract: `GET ${JOBS_API_URL}?company=&website=&location=` with `Authorization: Bearer ${JOBS_API_KEY}` returning `{ jobs: [{ title, source, location, posted_at, employment_type, url }] }`.

**Google Maps usage meter** (NFR-12, `features/maps`, November 6, 2026). Google's free allowance is per SKU and per month (Essentials 10,000, Pro 5,000, Enterprise 1,000 billable events since March 1, 2025, not pooled, reset monthly), so the adapter runs every call through a `MapsMeter`: `remaining(sku)` before the call and `record(sku, units, failed)` after it. Three SKUs are counted: `geocoding` (one call per new trip address; a re-run reuses the stored coordinates when the same provider found them), `places_text_search` (one call per page of up to 20 companies, the Enterprise SKU and the scarcest allowance), and `route_matrix` (one element per destination, only for a radius in driving minutes). Counts live in `maps_usage (sku, day, calls, units, failures)` (migration 13) and are summed per calendar month (UTC); the `maps` setting holds a monthly budget per SKU (defaults 9,000 / 900 / 9,000, 90% of the allowance because Google counts in Pacific time and bills some calls the app records as failures) and `warnAtPercent` (80). The geocode, the first places page, and the whole route matrix are checked before anything is spent and refused with a `MapsBudgetError` (a 503 to the client naming the SKU, the units needed, the remainder, and the way out: wait for the 1st, raise the budget, or use a km radius); later places pages simply stop. After each call `reachedThresholds` compares the month's total with the warning level and 100%, claims `job_runs (job = maps:<sku>:<percent>, period_key = YYYY-MM)` so an alert goes out once a month per SKU and level, and `notifyUsers` sends a `maps_usage` notification (and an event email to those who opted in) to every active administrator. Settings → Google Maps usage shows, per SKU, the budget, the month's usage, today's calls, the free allowance, a meter, and the next reset date; the planner page carries a note once a level is reached. Every planner user also sees the live card `features/maps/MapsUsageCard.tsx` on the planner and trip pages (`GET /api/maps/usage`, `plan_trips` or `manage_settings`): one tile per SKU with the month's units against the budget, what is left, a state pill (within budget, running low, budget spent), the reset date, and an estimate of the searches left; it refreshes after every search and polls every 30 seconds while the tab is visible, so usage spent by other people appears without a reload. The limits are enforced in the app regardless of any quota set on Google's side. `npm run maps:test` talks to Google directly and is not counted. Google's own per-API daily quota caps and a Cloud Billing budget alert remain the hard guarantee and are recommended in the README.

**Chosen Indeed source (decided October 25, 2026, PRD open question 10): HasData's Indeed Jobs Scraper API**, now one adapter inside the job-sources layer of §7.13, which combines it with the free sources. Facts taken from hasdata.com/apis/indeed-api, docs.hasdata.com/apis/indeed/listing, docs.hasdata.com/apis/indeed/job, and hasdata.com/pricing on that date:
- Authentication is the header `x-api-key: <key>`; calls are synchronous `GET` requests with query strings; credits are charged only for successful requests, 10 credits per Indeed call. Plans: Free 1,000 credits a month (about 100 Indeed calls, no card), Startup USD 49 for 200,000 credits, Basic USD 99 for 1,000,000, Growth USD 208 for 3,000,000; concurrency 5 / 5 / 15 / 50; unused credits expire monthly. HasData states that it reads publicly available data only, is not affiliated with Indeed, that Indeed's terms may restrict automated access, and that compliance is the customer's responsibility. No SLA document; no stated per-minute limit.
- `GET https://api.hasdata.com/scrape/indeed/listing?keyword=&location=&domain=&datePosted=&remoteType=&sponsoredOnly=&sort=&start=&nextPage=` returns `{ searchInformation: { title, totalResults }, jobs: [{ title, company, location, description (snippet), salary { min, max, type, currency }?, details: string[] (e.g. "Full-time", "Hybrid work"), sponsored, date ("30+ days ago"), isoDate, url }], pagination: { nextPage }, peopleAlsoSearchFor }`. `datePosted` takes 1, 3, 7, or 14 (days). The allowed `domain` values (regional Indeed sites such as ca.indeed.com) and the page size are not documented.
- `GET https://api.hasdata.com/scrape/indeed/job?url=<indeed viewjob url>` returns `{ title, company, location, salary, details: { jobType: string[] }, description, descriptionHtml }`. There is no separate job id field; Indeed's key is the `jk` parameter of the job URL.

**Adapter design (`features/trips/providers/jobs/hasdata.ts`, to build once the key exists; selected by `JOBS_PROVIDER=hasdata` and `HASDATA_API_KEY`, the generic contract above stays for any other source):**
- `jobs({ companyName, website, address })` calls `listing` with `keyword` = the company name (quoted), `location` = the city or address of the trip result, `domain` = the regional site for the trip's country (to be confirmed on the free tier; `ca` expected for Canada), `datePosted=14`, one page. Listings are kept only when `normalizeCompanyName(job.company)` equals the result's normalised name (§10.8 matching rules), so unrelated jobs that happen to mention the name are dropped. Mapping to the dialog rows: `title` → title, `"Indeed"` → source, `location` → location, `isoDate` → posted_at, the first of `details` that names a job type (Full-time, Part-time, Contract, Temporary, Permanent, Internship) → employment_type, `url` → url. Job detail is never fetched for the planner.
- Cost control: one call per company per trip run (up to 50, four at a time within the plan's concurrency of 5), results cached in `sales_trip_results.jobs` with `jobs_fetched_at` and refreshed only when older than a day (already the behaviour), a per-day call budget in settings with the Hiring column falling back to blank with a note when the budget is spent, and failures recorded per result so one bad call never fails a trip.
- Opportunity Recommendation (§10.10) uses the same adapter through `searchListings`: `keyword` = the Search Term's keyword, `location` = its location, `datePosted` = days since the last run (1, 3, 7, or 14), paging with `pagination.nextPage` up to a per-term page cap; `dedupe_key` comes from the `jk` of the URL; `job` detail is fetched on demand when a Sales Manager opens an opportunity (10 credits each), never in the daily run.
- Verification plan on the free tier before buying a plan: keyword-by-company precision for ten known client companies, the `domain` value for Canadian results, credit use per trip, and the matching rules against the live `company` strings; then an integration test behind an environment flag, kept out of the default suites.

**Alternatives reviewed (October 25, 2026, decision pending with the client).** Scraping Indeed directly is ruled out: Indeed serves a Cloudflare challenge to automated requests and renders search results in the browser, so it would need headless browsers with residential proxies and continuous upkeep, against Indeed's terms and robots rules, with the risk of the office IP being blocked. Because the planner and the Opportunity module both call the provider interface, the source can be swapped or layered without touching screens:
- *Indeed through another vendor:* Apify Indeed scrapers (community actors, about USD 2–5 per 1,000 results; the free plan's monthly credit covers roughly 1,000–2,500 results). Same data and the same compliance position as HasData; an adapter would mirror the HasData one.
- *Official aggregators with free tiers (not Indeed itself, overlapping postings):* Adzuna API (`https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id&app_key&what&where&company`; free developer key with 25 calls a minute, 250 a day, 2,500 a month; attribution "Jobs by Adzuna" required; Canada support and the `company` filter to confirm with a key), JSearch on RapidAPI (Google for Jobs results, including many Indeed postings; about 200 free requests a month, paid from about USD 25), the Government of Canada Job Bank (free RSS feeds per search; many small employers), and public ATS job boards (Greenhouse, Lever, Workable JSON endpoints; rare among the client's target companies).
- *Suggested evaluation:* a half-day, zero-cost comparison of Adzuna, JSearch, and the HasData free tier on ten known hiring companies from the client's tracker, measuring how many each finds and how precise the per-company match is; the result decides whether a paid Indeed source is needed, or whether Adzuna (free) serves the Hiring column with HasData kept for the Opportunity module only.

**Action matching (TRIP-07).** Normalisation: company name lower-cased, punctuation removed, legal suffixes dropped (inc, ltd, limited, corp, co); website reduced to its registrable domain; phones reduced to their last ten digits; address reduced to street number, street name, and city. Candidates are non-archived leads; archived leads are considered only when nothing else matches (PRD open question 12). A lead matches on domain equality, phone equality, normalised name equality with the same city, or name similarity ≥ 0.9 (Jaro-Winkler) with a matching address. Precedence when several match: domain, then phone, then name with address, then name; ties go to the most recently active lead. Action = the matched lead's combined status label (LEAD-06; "New / Not in CRM" when nothing matches). `matched_lead_id` lets the row open the lead.

**API.** §6.9. "Planned visits" are dates on shortlisted results (`planned_visit_date`); they become `road_visit_stops` when the road visit planner (§10.5) is built. New privilege `plan_trips` (Admin and Sales Manager by default). Trips, re-runs, shortlist changes, and planned visits are audited.

**Client.** View `trips` (my trips, new-trip form with the six criteria of TRIP-01) and `trips/<id>` (A16): column sort on every column (TRIP-09), an Action filter listing the combined labels present in the results (TRIP-08), shortlist checkboxes (TRIP-10), export and print buttons with the scope selector (TRIP-11), the job-listings dialog (TRIP-06). Printing uses a `@media print` stylesheet that renders the field-visit report: trip title, date, address and radius, then Company, Company Address, Distance, Hiring, Action, and the planned time for rows on a visit. The Excel export is a real `.xlsx` written with `exceljs`; the same dependency upgrades the reports CSV export (RPT-06).

**Verification.** `tests/unit/trip-matching.test.mjs` (normalisation, domain, phone, address keys, Jaro-Winkler, precedence, archived fallback, Action labels) and `tests/e2e/06-trips.test.mjs` (a lead recognised by domain, the listings dialog, shortlist, planned visit, Show and Action filters, the Excel export responding with a spreadsheet, the trip list).

### 10.9 Legacy tracker import (go-live data, LEAD-08) — as built

The client's current system of record is a Google Sheets workbook (`Sales Leads 2026.xlsx`, kept outside the repository because it holds real contact data), and the team keeps working in it until the application is stable on the server, so the import runs again whenever a fresh export arrives. Its main sheet `LeadsDec25` is one row per interaction (6,990 rows and about 3,780 companies on November 10, 2026, May 2025 onwards) with the BRD's columns, and since November 10, 2026 it is the only sheet read by default: `Clients` (the companies that are clients) and `ArchiveSales` (a 2021–22 pipeline with different columns) are read only with `--clients-sheet Clients` / `--archive-sheet ArchiveSales`; the other sheets are filtered copies and are ignored.

`scripts/import-tracker.mjs` (`npm run db:import -- "docs/Sales Leads 2026.xlsx" [--dry-run]`, or in Docker `docker compose run --rm setup node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" --dry-run`) reads the workbook with `exceljs`, finds the header row by its "Client Name" cell, and maps columns by name so small header differences between sheets do not matter. Everything runs in one transaction; `--dry-run` executes the whole import and rolls it back, so its report is exact. Pure rules live in `scripts/lib/tracker-mapping.mjs` (unit-tested in `tests/unit/tracker-mapping.test.mjs`); the run itself (`runTrackerImport`, `readSheet`, `buildLead`, `formatReport`, `parseOwnerMappings`, `TrackerImportError`) is `scripts/lib/tracker-import.mjs` since November 10, 2026, which takes the caller's `query` function and transaction and is shared by the command line and the app.

**Through the app (November 10, 2026).** Administration → Tracker import (`features/tracker-import`, `manage_settings`) uploads the export to `POST /api/imports/tracker` (§6.7): **Preview** runs the whole import and rolls it back, shows the report (count tiles, then collapsible sections with the leads edited in the app since the previous import opened first) and offers it for download; **Apply** is enabled once the chosen file has been previewed and asks for confirmation with the counts. The page shows the previous runs, whether the baseline workbook is still needed (and asks for it in that case), the Sales Manager names of the sheet with their accounts, and lets the person choose where companies without a Sales Manager go (the opportunity pool by default, or one person), the mappings (Name=email lines added to the built-in map), and the sheet names. The same endpoint serves `npm run remote -- import <file> [--apply]` (`scripts/ltp.mjs`) with an API token (§4), so the import runs from any machine without access to the server; the report is saved as `import-report.txt`. Previews need the baseline every time until an apply has stamped the entries. One import runs at a time per app instance; a second request is answered 409.

Rules:
- **One lead per company.** Rows are grouped by the normalised company name (same rules as §10.8: case, punctuation, legal suffixes). Rows are ordered by date then sheet order and the latest non-empty value wins per field; emails are the union of all rows; positions are joined; the lead type is the most frequent value. `first_contact_date` is the earliest readable row date, `last_activity_at` the latest; `created_at` is set to the first contact date so historical reports count the leads in their real periods, and `created_by` is the Sales Manager the lead goes to, so those reports credit that person; the `lead.created` audit entry keeps who ran the import. Until November 12, 2026 `created_by` held the importing administrator, which put every imported lead under that administrator's "leads created"; migration 20 corrects the leads of earlier runs from their imported `created` timeline entry. A second run of the same file is refused unless `--force`; a changed workbook is applied incrementally (next rule).
- **One timeline entry per row** (`lead_activities.meta` records the sheet, row, step number, status, type, and Sales Manager): `bd_action` when the row has a BD action (summary "Action · Response", the step prefix "3 ." stripped, the step kept in meta), `client_response` when it only has a response, otherwise `note` from the Notes or Contact Remark cell. Notes and remarks go in the body. A `created` entry marks the import. Each lead gets a `lead.created` audit entry and the run one `import.tracker` entry carrying the file hash and the counts.
- **Incremental runs.** Each row's fingerprint (SHA-256 of its mapped cells, the serial number left out, 32 hex characters) is stored on the timeline entry it produced (`meta.fingerprint`, next to `meta.sheet` and `meta.row`). On a later run a row whose fingerprint is already stored is left alone. The remaining rows and the stored entries whose rows are gone are paired per company, same date first and then in order (`pairRowChanges`): a pair is an edited row, and its entry is updated in place; an unpaired row is new and adds an entry, and a lead when the company is new; an unpaired entry is a row deleted from the sheet, listed in the report and kept. A company with new or edited rows has its lead rebuilt from all of its rows: the sheet wins for every field it fills (status, BD action, client response, city, lead type, owner, address, contacts, industry, follow-up and contract dates), emails and positions are unioned, comments are appended, and `first_contact_date` / `last_activity_at` only widen; a `status_change` entry ("… (sales tracker)"), an `edit` entry naming the fields, and a `lead.updated` audit entry with before and after values record it. Leads with an audit entry the import did not write since the previous run are listed in the report under "changed in the app", so the overwrite can be checked. A database filled by the import before fingerprints existed (before November 10, 2026) needs one run with `--baseline <the workbook that import used>`, which stamps the fingerprints onto the existing entries by row number; later runs need no baseline.
- **Lead types** "Office" and "Road_Trip" are imported as list values "Office" (created) and "Road Trip"; rows without a type default to Office.
- **BD actions**: the tracker's "Cold Call" / "Cold Email" are imported as the BRD's "First Call" / "First Email" unless `--keep-action-names`; typos ("Contract Clerification", "Waiting For Profile") map to the existing values; anything else ("Meeting") is created in the list. The two numbered sequences (road trip 1–11, office 1–10) collapse into the single BD-action list, with the step number kept per timeline entry (PRD open question 13).
- **Statuses** Cold / Warm / Hot / Client map by name; the archive's "Won" is Client; companies on the `Clients` sheet are set to Client when `--clients-sheet` is given; rows without a status default to Cold. Negative responses stay as responses (no Lost or Disqualified is inferred).
- **Cities** match case-insensitively; a trailing ", ON" is dropped; known misspellings ("St Catherines") map to the existing value; new cities are created in Title Case.
- **Contacts**: phone cells may be numbers, text, or several numbers ("905-… / 416-…"); the first becomes the phone, the next the alternate, the rest go to the contact remark; "N/A" is empty. Email cells are split on spaces, slashes, commas, and semicolons; invalid parts become a dated comment; an email found in the industry column moves to the emails.
- **Address / Comments**: text with a postal code, or a street number with a street word, or ", ON" is the address; everything else becomes a dated comment. Unreadable follow-up dates ("snow season") and stray text in the contract-signed column become dated comments too.
- **Dates** come from date cells (sanity range 2000–2100) or the text spellings the sheet uses (`Jan/20/26`, `20/08/2025`, month first when ambiguous as the sheet declares).
- **Sales Managers** are matched by name to accounts through a built-in map (Daniel, David, Gaya, Sara from the workbook's MasterData sheet; Adam assumed as adam@scilltech.com) or `--owner "Name=email"`; missing accounts are created as active Sales Managers with a random password so an administrator sends them a set-password link. A company whose rows name no manager goes to the opportunity pool (next rule) unless `--default-owner <email>` is given.
- **Opportunity pool (November 10, 2026).** A company with no Sales Manager in any row becomes a pool card (`opportunities`, status new, `company_key` from the pool's own normalisation, `poolCompanyKey`) whose `draft` holds the lead the import would have created (fields with named list values) and one timeline entry per row with its fingerprint; the list values it needs are created at import time. Under Opportunities the card is marked "Sales tracker" and shows the sheet's status, contact, and rows; **Assign as lead** pre-fills the form from the draft, creates the lead for the chosen owner without the historical-date approval queue and without a BD-action entry of today, writes the drafted entries to the timeline in the owner's name (so the next import recognises those rows), and clears the draft (`claimOpportunityForLead`). On later runs a draft's rows count as imported; new, edited, or vanished rows of the company rebuild the draft, and a company gone from the sheet loses its card (kept with the draft cleared when job listings hang on it); a sheet that now names a manager creates the lead and marks the card converted (`opportunity.converted` audit entry), as does a lead created by hand for the same company, whose draft rows are then written to that lead; a card marked not relevant in the app is skipped and listed under companies skipped; a lead renamed after it was assigned from a card is still found through the card's `lead_id`. The report lists the pooled companies and counts the cards created, updated, assigned, and removed.
- **Archive sheet** (only with `--archive-sheet ArchiveSales`): one archived lead per company not already present (reason "Imported from the 2021–22 archive sheet"), with the stage, quarter, and agreement date kept as comments.
- **Report** (`import-report.txt`, git-ignored): counts, every default applied with its count, the fields changed on existing leads, accounts and list values created, leads changed in the app since the previous import, rows removed from the sheet, leads updated, rejected rows (no client name), companies skipped, and the row-level warnings by kind.

Verified on 2026-11-10 through the API on the dev stack (`npm run remote -- import … --baseline …`, preview): the same counts as the command-line dry run below in 11.6 s; and with a throwaway two-company sheet applied twice: 2 leads and 5 entries created, the same file refused with 409, an edited row updated in place with the status change and the edit entry, a new row added, the entries cleaned up afterwards. Verified on 2026-10-23 against the client's workbook: 3,611 leads and 226 archived leads from 6,681 + 290 rows, 10,506 timeline entries, 13 seconds, 12 rows rejected (no client name), 92 warnings, all listed in the report. Verified on 2026-11-10 (dry runs): the October 19 workbook against the database of that import, with `--baseline`, changes nothing (6,669 rows unchanged); the November 10 workbook reads 6,978 rows, leaves 6,658 unchanged, updates 10 edited rows in place, adds 105 rows to 78 existing leads (77 updated, 2 status changes), creates 167 leads from 206 new rows, lists 1 row deleted from the sheet, rejects 12, in 10 seconds.

### 10.10 Opportunity Recommendation (OPP-*, BRD §25) — design sketch; first version built November 6, 2026 as §7.14 (shared pool instead of per-person terms), the rest stays the plan

**Tables.** `opportunity_channels` (id, name, type `api` | `feed` | `career_page` | `other`, status `active` | `paused` | `inactive`, config JSONB (provider key and settings, secrets encrypted like Gmail tokens), availability `all` | `selected` with `opportunity_channel_users`, priority, last_success_at, last_error, created_by, timestamps). `opportunity_search_terms` (id, owner_id, name, keyword, job_type_id FK list_values, location_id FK list_values, all_channels BOOLEAN, expiry_date, status `active` | `paused` | `inactive`, last_run_at, next_run_at, found_count, new_count, timestamps) with `opportunity_search_term_channels`. `opportunities` (id, owner_id, search_term_id, company_name, job_title, job_type, location, posted_on, summary TEXT, primary_channel_id, source_name, source_job_id, url, found_at, status `new` | `reviewed` | `converted` | `irrelevant`, irrelevant_reason_id FK list_values, matching_keyword, last_checked_at, matched_lead_id FK leads, match_kind `lead` | `client` | `opportunity` | `irrelevant` | NULL, converted_lead_id FK leads, dedupe_key VARCHAR(64)) with `opportunity_sources` (opportunity_id, channel_id, source_job_id, url, found_at) for every channel a listing appeared on. `opportunity_search_runs` (id, search_term_id, run_type `scheduled` | `on_demand` | `similar`, started_at, finished_at, channels JSONB, listings_found, new_count, duplicate_count, status `success` | `partial` | `failed`, error TEXT). `leads.opportunity_id` (LEAD-01 #26). Lists: `job_type`, `opportunity_location`, `irrelevant_reason`.

**Connectors.** One interface, `searchListings({ keyword, jobType, location, radiusKm?, since? }) → Listing[]`, implemented per channel type and selected by `channels.config.provider`; the Sales Trip Planner's job contract (§10.8) is the first API connector, a career-page connector fetches permitted pages and extracts postings, and a stub connector serves fixed listings for tests. Connectors run in isolation (per-channel try/catch, timeout, and run record) so one failure never stops a run (OPP-06, OPP-22).

**Scheduler.** A separate `jobs` process (`scripts/run-jobs.mjs` as a compose service, or an external cron hitting `POST /api/jobs/opportunities` with a shared secret) runs at the Admin-configured time and time zone, iterates active terms (capped by the per-manager maximum), writes runs and opportunities in one transaction per term, then queues the Daily Opportunity Report through the notification pipeline (§10.3) and the mailer. The same runner can carry the TASK-06 reminder digests.

**Dedupe and CRM match.** `dedupe_key` = SHA-256 of normalised (source job id ∥ url) when present, else (normalised company ∥ title ∥ location ∥ posting date); a Jaro-Winkler check on the summary catches near-duplicates across channels. The CRM check reuses `features/trips/matching.ts`: a matched lead, client, or earlier opportunity sets `match_kind` and `matched_lead_id` (OPP-07, OPP-09). Rediscovered opportunities keep their status.

**Screens.** Navigation item with submenu and badge (OPP-02); dashboard cards and grouped list (OPP-11, wireframe 25.24); search-term form with channel checkboxes and "Save & Run Now" (25.26); Admin channel screen with Test (25.25); Convert opens `LeadFormDialog` pre-filled and links both records (OPP-12); Irrelevant prompt with reason list (OPP-13); Find Similar opens the term form pre-filled (OPP-14); run history per term (OPP-16); channel and opportunity reports beside the performance report (OPP-18, OPP-19). Privileges: `manage_opportunities` (Sales Manager, Admin) and `manage_channels` (Admin).

**Source decided (October 25, 2026):** the Indeed channel is HasData's Indeed Jobs Scraper API through the adapter in §10.8 (`searchListings` maps to the `listing` endpoint with `nextPage` paging; `job` detail on demand). The jobs scheduler now exists (§6.10, `scripts/jobs.mjs`), so the daily run is one more job behind `POST /api/jobs/run`. **Open before building:** the client's HasData account, key, and plan, and the compliance acknowledgement recorded in PRD open question 10.


### 10.11 Pipeline board and stages (after the trial of a commercial CRM) — design of November 11, 2026; Phase 1 built the same night

**Background.** The client looked at a commercial sales CRM and asked for its feel: leads moving through named stages on a board, drag-and-drop, and the discipline of always having a next step. The project owner took a Premium trial (Scilltech account), built a draft pipeline there, and recorded a walkthrough; the recording and the meeting notes are reference material in the git-ignored `input/` folder at the repository root, never part of the app. Decided by the project owner on November 11, 2026, to be confirmed with the client: the existing flows are moulded after it, and the advanced parts (several pipelines, deal value and forecast, email sequences, required fields per stage, visibility groups, Smart Docs, WhatsApp) stay out of scope.

**Decisions.** (1) One pipeline for every lead type (Road Trip, Cold Call, Cold Email, and Office from the import) with a lead-type filter; a second pipeline only if road trips ever need different steps. (2) No deal value, positions count, expected close date, or forecast; columns show counts only. (3) The stage columns are the owner's draft from the trial ("Temp Hiring Pipeline"): New Deal → Contact Made → Qualified → Profile Shared → Meeting Completed → Negotiations started → Contract Signed; the draft's last step, People Deployed, is the Client status (the won outcome), which takes the lead off the board, as Lost Lead and Disqualified already do. (4) Cold / Warm / Hot stays the status, shown as a tag on the card, and is not derived from the stage. (5) The word Lead stays for the company record; the opportunity pool (§7.14) plays the part of a leads inbox, and assigning a card starts the lead in New Deal. (6) The detailed BD-action list stays as the record of what was done; the stage is the coarser position on the board.

**Model (migration 18).** A new list key `stage` in `list_values` (§3.5), seeded in order with the codes `new_deal`, `contact_made`, `qualified`, `profile_shared`, `meeting_completed`, `negotiations_started`, `contract_signed`; administrators rename, reorder (the existing reorder API), add, and deactivate stages under List of values, and `new_deal` is relied on by code as the entry stage. `leads.stage_id` FK `list_values` NULL ON DELETE SET NULL, indexed; every active lead has a stage, backfilled by the migration from the lead's BD action through the mapping below, `new_deal` where there is none. `list_values.stage_id` FK `list_values` NULL on `bd_action` rows: the stage a BD action lands in, shown as a Stage column under List of values → BD action and edited there. A new activity type `stage_change` (summary "Stage changed from Contact Made to Qualified", `value_code` = the new stage code, `meta.from`, `meta.via` = `board` | `bd_action` | `detail` | `import`); it bumps `last_activity_at` like every entry (§7.2), so a move resets the quiet clock the way an activity does.

**Default mapping of BD actions to stages** (editable; action names the import added beyond the seeded list start unmapped and count as Contact Made when the lead has any action):

| Stage | BD actions that land there |
|---|---|
| New Deal | no action yet · Plan a Visit · New Position |
| Contact Made | First Call · First Email · First Meeting · Left Brochure · HR Contact Information Received · Introduction Email Sent · Email Followups · Followup Call |
| Qualified | Engagement / Ans Questions · Waiting For Profiles from Recruitment |
| Profile Shared | Shared Profiles · Followup on Profiles |
| Meeting Completed | In Person Meeting Scheduled · Virtual/Phone Meeting Scheduled |
| Negotiations started | Contract Sent · Contract Clarification · Contract Followup |
| Contract Signed | Contract Signed |

**Stage changes.** `setLeadStage(leadId, stageId, actor, via)` in the leads repository, allowed for whoever may edit the lead (§5.2), writes the `stage_change` entry and an audit row `lead.stage`. Recording a BD action whose stage is later in the order moves the lead forward automatically (never backward; the entry says `via: bd_action`); a backward move is a deliberate drag or a choice on the lead page. Status changes leave the stage alone: Client, Lost Lead, and Disqualified hide the card, and a reopened lead reappears in the stage it had. New leads, including those assigned from the pool, start in `new_deal` unless the form picks a stage.

**Board.** A new Workspace entry, Pipeline, between Action center and My leads (`features/pipeline`: `PipelinePage`, `StageColumn`, `LeadCard`, `MoveToMenu`, `client.ts`, server `repository.ts`). One column per active stage in `sort_order`, a header with the stage name and count; the cards are the active leads whose status is neither closed nor Client. Toolbar: Mine / Team (Team for users who may view every lead), lead type, owner, status (Cold, Warm, Hot), and a text filter; cards sort by the next step's date (earliest first), then last activity. Each card shows the client name and city, the status pill (`StatusPill`), the owner's avatar, the last BD action, a next-step line (the earliest open task's due date, else the follow-up date; red when overdue; a hollow dot and "No next step" when there is neither), and a quiet marker when the lead has gone longer than its limit without activity (`resolveInactivityDays`, §7.9), which tints the card. Columns load fifty cards each with Show more; the counts come from one grouped query. Drag-and-drop uses the browser's own drag events (`draggable`, `onDragStart`, `onDragOver`, `onDrop`; no new dependency); the Move to… menu on each card (keyboard and touch) lists the stages, and both call `PATCH /api/leads/:id/stage` with an optimistic update and a toast with Undo (which moves the lead back, logged as a second entry). Clicking a card opens `LeadDetailDialog`.

**Rules that keep deals moving.** (1) Rotting per stage: `InactivityRule` (§7.9) gains `stageId`, precedence status + action > action > status + stage > stage > status > default; the Settings rule editor adds the stage select, and the Action Center's needs-attention list honours the result. (2) Next step after every activity: after a logged call, email, or visit, a BD action, or a stage move, the dialog offers a next task (type, due date through `NaturalDateField`, assignee) pre-filled from the stage's default, for example Contact Made → a call in one business day, Profile Shared → a follow-up call in three business days; the business calendar skips weekends and holidays as it does today (§7.10); Skip is one click, and the note-based suggestion of NOTE-05 stays. (3) No next step: a lead with no open task and no future follow-up date is flagged on the card, listed on the Action Center ("No next step", beside Needs attention), and counted in the daily digest. (4) Settings → Pipeline holds the per-stage default follow-up (`pipeline.followUps[stageCode] = { activity, businessDays } | null`) and the switch `pipeline.autoFollowUp` (off by default), which creates the default task without asking; the per-stage days live with the other needs-attention rules.

**Other screens.** `LeadDetailDialog` gets a stage bar across the top (the stages in order, the current one highlighted, click to move with a confirmation), and the Overview's quick updates a Stage select beside BD action. The lead list gets a Stage column and filter (`LeadFilters.stageId`, `GET /api/leads?stageId=`), and the bulk bar a Move to stage. The lead form shows the stage for new leads (default New Deal). Analytics (§7.16) "Pipeline now" adds a by-stage row of tiles and by-owner bars by stage, and the KPI report emails (§7.18) add "Pipeline by stage"; later, from the `stage_change` entries, a Stage over time chart, time in stage, and stage-to-stage conversion next to the status ones. Opportunities keeps its name and behaviour; Assign as lead starts the lead in New Deal.

**Import.** `scripts/lib/tracker-import.mjs` sets a created or refreshed lead's stage from the mapping of its latest BD action (the company's last row in sheet order), `new_deal` without one, and writes no `stage_change` entries for historical rows (the `bd_action` entries carry the numbered steps). The migration's backfill applies the same rule to every existing lead.

**API.** `GET /api/pipeline?scope=mine|team&leadTypeId&ownerId&statusId&q&stageId&offset` → `{ stages: [{ id, code, value, count, leads: [card] }] }`; `PATCH /api/leads/:id/stage { stageId }` → the lead summary (403 outside §5.2, 400 for an inactive stage); `GET` / `PUT /api/settings` carries `pipeline`; `PATCH /api/list-values/:id { stageId }` for `bd_action` rows; `reminders.rules[].stageId`.

**Phases and effort** (estimates of November 11, 2026, for one developer, tests included):

| Phase | Covers | Estimate |
|---|---|---|
| 1 | migration 18 (stage list, `leads.stage_id`, `list_values.stage_id`, backfill), the mapping under List of values, `stage_change`, the Pipeline page with drag-and-drop and Move to…, filters, the lead list column and filter, the import | 3–4 days |
| 2 | per-stage needs-attention days, the next-step prompt with per-stage defaults, the no-next-step flag on the board, Action Center, and digest, the auto-follow-up switch | 2 days |
| 3 | stage bar and select on the lead page, bulk move, Analytics and KPI by stage, stage over time and time in stage | 2 days |

**Tests.** Unit: the BD action → stage mapping and the backfill rule, rule precedence with `stageId`, the next-step default per stage, the pipeline query's card shape. Browser: `tests/e2e/09-pipeline.test.mjs` opens the board, moves a card through Move to… (HTML5 drag-and-drop is unreliable under Selenium, so the drop handler is unit-tested and the menu carries the browser test), finds the entry on the timeline and the lead in the new column, filters by status, and saves a per-stage rule under Settings; `05-admin-reports.test.mjs` checks the Stage column under List of values → BD action.

**Open before building.** (a) The client confirms the stage names and the mapping table (both editable later, but the backfill runs once). (b) The per-stage days and default follow-ups; the proposal is three days for New Deal and Contact Made, five for Qualified through Negotiations started, none for Contract Signed, with a call in one business day after Contact Made and a follow-up call in three after Profile Shared. (c) Whether client responses should also move the stage (Engaged, Interested, Connected with HR → Qualified). (d) Whether the Pipeline page becomes the landing page for Sales Managers in place of the Action center. (e) The name of the entry: Pipeline, Deals, or Board.

**As built, Phase 1 (November 11, 2026, night).** The project owner answered the remaining questions before the build: client responses do not move the stage (only BD actions and moves do), the Action center stays the landing page, and the entry is called Pipeline. Migration 18 is as designed, and the one-time placement is repeatable: `recomputeLeadStages` behind "Recompute stages from BD actions" under List of values → BD action (confirmation dialog; audit `lead.stages_recomputed`; no timeline entries) places every lead again after the mapping changed, so the mapping no longer has to be right the first time. The BD action list there shows a Stage column (a select per action, "Not mapped" = Contact Made). `features/pipeline`: `model.ts` holds the pure rules (`resolveStageForAction`, `stageAdvances`, `nextStepOf`, `quietDaysSince`, `compareCards`, `parsePipelineFilters`), `repository.ts` the board query (one grouped count query and one window-function query that takes the first 50 cards per column, the next open task joined laterally, the quiet marker from `resolveInactivityDays`), and `PipelinePage.tsx` the board. Differences from the design: the undo is a bar above the board ("Moved X to Y · Undo", gone after ten seconds) rather than a toast action; the Move to… control is a select laid over the arrows icon on each card (keyboard, touch, and the browser tests use it); administrators open the board on Team, everyone else on Mine; the toolbar carries the status filter and search (client, contact, city, BD action, industry, owner), the panel the lead type and, on Team, the owner; the owner's name shows on the card only in Team scope; an awaiting-reply envelope (MAIL-01) joins the next step and the quiet marker; local moves and Show more sit on top of the last server answer and fall away when a fresh board arrives (`dataVersion`). The lead page's Overview got the Stage quick update in this phase (the stage bar stays in Phase 3), the lead form a Pipeline stage field defaulting to New Deal, the lead list a Stage column and filter (bulk move stays in Phase 3). `setLeadStage` serves the board and `PATCH /api/leads/{id}/stage`; `updateLead` advances on a BD action from a later stage (`via: bd_action`) and records an explicit stage (`via: detail`); `createLead` takes the form's stage, else the action's, else New Deal; the tracker import and the sample seed place leads by the same rule, and the import moves a refreshed lead forward when its newest action belongs to a later stage. On the dev database (the client's workbook) migration 18 placed 176 leads in New Deal, 3,407 in Contact Made, 12 in Qualified, 18 in Profile Shared, 2 in Meeting Completed, and the 226 archived leads in New Deal; one imported action ("Meeting") is unmapped and counts as Contact Made until an administrator maps it. **As built, Phase 3 (November 12, 2026).** (1) `StageBar` across the top of the lead page (every active stage in board order, plus the lead's own stage when inactive; earlier stages ticked off, the current one highlighted; a click on another stage asks "Move X to Y?" and then calls `PATCH /api/leads/{id}/stage` with `via: detail`, so the timeline, the audit row, the automatic follow-up and the next-step prompt behave as for a board move). (2) Bulk move from the lead lists: "Move to stage" in the bulk bar (anyone who may edit leads; not on the archive) opens a dialog with the target stage (New Deal pre-selected) and calls `POST /api/leads/bulk` with `action: stage`; `bulkSetStage` moves each selected lead that is active, not already there, and editable by the caller (`via: list`), and reports the count. (3) Analytics (§7.16): "Pipeline now" gains a "By stage" row of tiles over the board's population (active, not Client or closed; a lead never placed counts in New Deal) with a drill-down per stage and, team-wide, stacked bars per salesperson by stage (click = that person's leads in that stage); "Stage over time" sweeps the `stage_change` entries with the same bucket logic as the status chart, taking a lead to have been in the "from" stage of its first move since creation, else in its current stage all along (so leads placed by migration 18 count in their placed stage from their creation date); "Time in stage" gives median and 75th-percentile days of the stays that ended in the period, the leads measured, and how many leads entered each stage in the period, with the period's stage moves split into forward and back (`summarizeStageMoves`, board order). (4) The KPI emails carry "Pipeline by stage (N on the board)" after the pipeline by status. Measured on the dev database on November 12, 2026: the Analytics answer for the last 30 days stayed well under two seconds with 3,600 leads.

**As built, Phase 2 (November 12, 2026, early).** (1) Rotting per stage: `InactivityRule.stageId` (null = any); a rule matches when each set field equals the lead's, and the most specific match wins by score (BD action 4, stage 2, status 1), which keeps the documented order status + action > action > status + stage > stage > status > default; `updateSettings` validates stage ids; the Settings rule rows carry a stage select; the dashboard, Analytics (stalled leads, team board), and the board's quiet marker all pass the lead's stage. Migration 19 appends the proposed stage rules once (3 days for New Deal and Contact Made, 5 for Qualified through Negotiations started, none for Contract Signed) when no stage rule exists yet; administrators change or remove them under Settings. (2) Settings → Pipeline next steps (`app_settings.pipeline`, §3.12): per stage an activity (call, email, visit, task) and a number of business days, defaults Contact Made → call in 1 and Profile Shared → call in 3; two switches, "ask for the next step" (on) and "create automatically" (off). (3) The next-step prompt, `NextStepDialog`: after a logged call, email, or visit that created no follow-up task of its own (NOTE-05), after a BD action or a stage chosen on the lead page, and after a move on the board, "What's next for X?" opens pre-filled by `defaultNextStep` (the stage's suggestion, else a follow-up on the next working day; weekends and holidays skipped; the title names the client executive, else the company); it creates the task for the chosen person (the owner by default) and, unless unticked, sets the lead's follow-up date to the same day; Skip is one click; the prompt is held back when the automatic switch is on or the person cannot manage tasks. (4) Automatic follow-ups, `createStageFollowUp` (server): with the automatic switch on, the two lead routes create the stage's suggested task for the owner after the stage changed (due 09:00 business time N working days later, the follow-up date moved forward when earlier) and return it as `task`, which the board and the lead page show in the toast; it runs after the move's transaction, so a failure never undoes the move. (5) No next step: the dashboard's `noNextStep` list and count (§7.9), a fourth reminder panel on the Action Center, and a section in the daily digest; the board card's "No next step" line from Phase 1 completes the picture.

---

### 10.12 To Do lists — asked for and built November 12, 2026

The team asked for a way to put a lead aside for a later step. Their example: a lead they keep calling and cannot reach goes to "To be visited", so the visits can be planned together. More such lists are expected. The project owner's decision: the salesperson moves the lead by hand whenever they see fit and takes it off by hand; the app neither suggests nor moves anything.

**Model.** The lists are values of the list key `todo_list` (List of values → To Do list: add, rename, reorder, switch off; migration 21 seeds "To be visited"). A lead is on one list at a time: `leads.todo_list_id` and `leads.todo_since`. One at a time matches how the team describes it ("move it to") and keeps the counts honest; if a lead ever has to be on two, the column becomes a join table. A list that is switched off keeps its leads and stays visible on the To Do page until they are moved. The word "queue" is avoided on screen because "Queued leads" already means leads waiting for approval.

**Moving a lead** (`setLeadTodo`, `features/leads/repository.ts`; rules in `todo-model.ts`): the owner of the lead, or anyone with `edit_any_lead`, from the lead page (Overview → To Do list), or for a selection from any lead list (Move to To Do; on the To Do page also Take off To Do). Only active leads go on a list; a lead can always be taken off. Each move writes a `todo` timeline entry and an audit row, and counts as activity on the lead like any other entry.

**Seeing them.** Sidebar → To Do, with the number of the person's own leads on a list: the lead list restricted to leads on a To Do list, one tab per list with its count (All lists first), My leads or Everyone, longest on the list first (`sort=todo_since`). Every lead list shows "To Do: <list> · since …" under the client's name and has an "Any To Do list" filter.

**Not built, by decision or for later.** No automatic suggestion or removal, no day limits, no effect on "No next step" or "Needs attention" (a lead on a list is still judged by its follow-up date and tasks), no To Do counts on the Action Center, in the digests, or on the Pipeline cards, and no hand-over of "To be visited" to the trip planner. Each is a small addition on this model when the team asks.

### 10.13 The standard CRM layout as the base: names, layout, deal page, contacts — decided and step 1 built November 13, 2026

**Why.** After the Pipeline board (§10.11) went live, the colleague who runs the server asked for the product to follow a standard sales CRM (except its AI features), with our features added on top of that. The project owner agreed the same day: take the standard CRM layout as the base, keep our features, follow its layouts as far as possible, and use its names for Leads and Deals. This reverses the direction of §10.11 (our app with a stage board added) and replaces its decision not to rename. What is copied is the structure and the flow; colours, logo, icons and wording stay LeadTrailPro's own.

**Names.** In everything a person reads (screens, messages, emails, exports, the import report): a *lead* is now a **deal**, an *opportunity* is now a **lead**, the opportunity pool is the **Leads inbox**, Tasks & reminders is **Activities**, Analytics is **Insights**, "Assign as lead" is **Convert to deal**. "Lead generation" keeps its name (it produces leads in the new sense). Not renamed: code identifiers, tables and columns (`leads`, `opportunities`), API paths, privilege codes (`view_leads`), audit actions (`lead.created`), requirement IDs (LEAD-*, OPP-*), and text already stored (old timeline entries and notifications keep the words they were written with). Migration 22 renames the two seeded values that carried the old word, unless an administrator had renamed them: status "Lost Lead" → "Lost", inbox reason "Existing lead" → "Existing deal". The tracker still maps the sheet's "Lost Lead" to the status code `lost`.

**Addresses.** `#/deals` (board), `#/deals/list`, `#/deals/archive`, `#/deals/queued`, `#/deals/cold|warm|hot|client`, `#/deal/<id>`, `#/leads` (the inbox), `#/contacts/people`, `#/contacts/companies`, `#/activities`, `#/insights`. Addresses from before keep working through `routeAliases` in `AppShell.tsx`: `#/pipeline`, `#/all-leads`, `#/cold` …, `#/queued`, `#/archive`, `#/lead/<id>`, `#/opportunities`, `#/tasks`, `#/reports`. One address changed meaning: `#/leads` was "My leads" and is now the inbox; "my deals" is `#/deals/list?scope=mine`.

**Shell** (`features/shell/AppShell.tsx`). Dark menu: Action center, Deals (with the number waiting for approval), Leads (new in the inbox), Contacts, Activities (open tasks), Insights; then TOOLS (To Do, the planners) and MANAGE. Top bar: page title, the search over all deals, and a quick-add "+" (Deal, Activity) that works from every page. The separate menu entries for My / All / Cold / Warm / Hot leads, Clients, Queued and Archive are gone: they are views and filters of the Deals page.

**Deals page** (`features/leads/DealsPage.tsx`). One heading, a view switch (board, list, archive, and the approval queue for people with `review_queued`), and "+ Deal". The board is §10.11's (`PipelinePage`), restyled: a grey lane per stage with "N deals" under its name, cards with the client, the contact and city, the owner, the status label, a mark for the next step (green planned, red overdue, amber none), and a "+" at the foot of a lane that opens the add dialog with that stage chosen. The list is `LeadListPage` with My deals / Everyone. Recruiters get the list only. Since §10.19 (built November 16, 2026): the menu entry and title become "Pipeline" (PD-26), the board uses the whole window (PD-20), the next-step mark gives way to one actions menu on the card (PD-22), and a board by status and a date filter join the view switch (PD-23, PD-24).

**Deal page** (`features/leads/DealPage.tsx`, replacing the lead dialog). A deal opens as a page at `#/deal/<id>`; the page the person came from stays mounted underneath (hidden), so Back returns to the same filters, page and scroll position. Header: back arrow, name, status select, owner, Edit / Transfer / Archive (or Approve / Reject, Restore); under it the stage bar. Left column, collapsible panels: Summary (stage, BD action, client response, To Do list, follow-up, deal type and category), Person (contact, emails, phones, remark, client's last email), Company (client, industry, size, city, address, website), Overview (dates, creator, positions, comments). Right column: the composer (Add note, Log call, Log email, Log visit, Schedule follow-up), Focus (the next follow-up and the open tasks; completed ones behind a toggle; Create task) and History (Timeline with All / Notes / Activities / Changes, Collaboration, Emails, Documents, Profiles shared, Audit). Every rule behind these controls is unchanged.

**Add-deal dialog** (`LeadFormDialog`). Two columns: the deal on the left (client, contact person, stage, type, status, dates, owner, BD action, response, category, positions, comments), PERSON and COMPANY on the right. The fields and the duplicate guard are the same.

**Contacts** (`features/contacts`, §6.17). People and Companies as two lists with search. In step 1 they were read from the deals; since §10.14 they are records with pages of their own.

**Kept as they are in step 1.** Action center as the landing page, To Do, the trip planner, the Leads inbox (renamed only), the Activities page (the task list, renamed only), Insights (renamed only), all administration pages, emails and digests (reworded only). Field labels "Client name" and "Client executive" stay until step 2.

**Next steps.** Step 2 began the same day with contacts as records (§10.14: people and companies added before any deal, several deals per company). Step 2 continued the same day with deal value and expected close date (§10.15) and several pipelines with their own stages (§10.18); probabilities per stage and Insights dashboards are not built. Before step 3 come the colleague's comments of November 16, 2026 (§10.19). Step 3: activities with types and a calendar, custom fields, saved filters, list column chooser. Not planned: AI features, an automation builder, two-way email sync, mobile apps, marketplace.

**Tests.** `tests/unit/contacts.test.mjs`; the browser suite follows the new menu and the deal page (`helpers/ui.mjs`: `deals(view)`, `openAddDeal()`, `dialogTitle` and `closeDialog` also serve the deal page) and `02-leads` checks an old address and Contacts.

### 10.14 Contacts as records: starting from a contact — built November 13, 2026

**Why.** Feedback on the live version the same day: "I too want to start from a contact." In a standard CRM a person and a company exist on their own, and deals are added to them. Until now a contact here was only what a deal said about its client, and the duplicate guard allowed one record per company.

**Model (migration 23).** `organizations` (name, unique without case as `name_key`; website, address, city, industry, company size; owner, creator) and `persons` (name; company or none; emails, phone, alternate phone, remark; owner, creator; one name per company). `leads.organization_id` and `leads.person_id` link every deal. The migration creates one company per client name and one person per contact name at that client from the deals that exist, and links them.

**The deal keeps a copy.** A deal still carries the client name, the contact's name, emails, phones, address and the rest in its own columns, because the search, the lists, the duplicate guard, the trip planner's matching, the mailbox watch, the reports, the exports and the tracker import read them there. Rewriting all of those in one step on live data was the larger risk. Instead one module keeps both sides the same (`scripts/lib/contacts-sync.mjs`, shared by the app, the import, the sample data and the migration; app rules in `features/contacts/sync.ts`):

- *A deal is created*: it joins the company and the person of those names (created when new); what was typed on the deal updates them where it says something (an empty field never wipes a value), and every deal of both then shows the same values.
- *A deal's contact fields are edited*: the edited fields go to the company or person and on to their other deals. A changed client or contact name fixes the name of a contact that only this deal uses; otherwise the deal moves to the contact of the new name.
- *A company or person is edited on its page*: the values go to every deal linked to it.
- *The tracker import*: after its run every deal is linked, and a contact with a single deal takes that deal's values (the sheet is the newer source).

Removing the copies and reading contacts through the links is a later clean-up; nothing a person sees depends on it.

**Starting from a contact.** Contacts → People or Companies → "+ Person" / "+ Company" adds one with no deal. A person names their company by typing it: an existing one is linked (suggested while typing), a new name creates it, empty is allowed (since §10.19: the company becomes required, and a new one is created only after a confirmation). The contact's page (`#/person/<id>`, `#/company/<id>`, `features/contacts/ContactPage.tsx`) uses the deal page's layout: details (and, for a company, its people with "+ Person") on the left; its deals and the combined history of those deals on the right. "+ Deal" opens the add-deal dialog filled from the contact. On the deal page the person's and the company's names are links to their pages.

**Several deals per company.** The duplicate guard is unchanged for a deal typed in from scratch: the same company, email, website or phone is refused with a link to the existing deal, which keeps two people from working one company unknowingly. A deal added from the company's (or its person's) page is deliberate, so that company's own deals are not counted as duplicates.

**Rights.** Everyone who may see deals sees every contact. Adding needs `create_leads`. A contact is edited by its owner (the person who added it, or the owner of the deal it came from) with `edit_leads`, or by anyone with `edit_any_lead`. Only a contact without deals can be removed.

**Built after this section** (the same day): notes and calls on a contact itself, moving a person, merging duplicates (§10.16), the contacts timeline (§10.17), deal value and expected close date (§10.15), several pipelines (§10.18). **Still not built:** files on a contact itself, an owner change for contacts, tasks linked to a contact without a deal.

**Tests.** `tests/unit/contacts.test.mjs` (keys, input rules, labels); `tests/e2e/11-contacts.test.mjs` (a person with a new company before any deal, a deal started from the person, a second deal from the company, an edit of the company reaching its deals, add and remove of a company without deals); `02-leads` opens the person's and the company's pages of a deal created the usual way.

### 10.15 Deal value and expected close date — built November 13, 2026 (PD-11)

Both are optional and stay out of the way when empty, as agreed with the project owner: the team does not always estimate a deal. `leads.deal_value` (NUMERIC 12,2, zero or more) and `leads.expected_close_date` (migration 24); `dealValue` and `expectedCloseDate` on the deal's input, validated in `features/leads/deal-value.ts` (a typed amount with or without separators or the currency sign; one currency, `CA$`, no picker). The add / edit dialog has "Value (CA$)" and "Expected close date"; the deal page shows the two rows in Summary only when one of them is filled; a board card shows the value when it has one, and a stage shows "CA$… · N deals" when the deals in it (all of them, not only the cards loaded) add up to more than zero. Lists, reports, exports and emails are unchanged. Changes are audited and appear on the timeline like any other edit. Not built: a forecast view by expected close month, value totals in Insights and KPI emails, other currencies.

### 10.16 Notes on a contact, moving a person, merging duplicates — built November 13, 2026

**Notes and calls on the contact itself.** Starting from a contact (§10.14) left a gap: a person or company without a deal had nowhere to record a first call. `contact_activities` (migration 25: company or person, author, type note / call / email / visit, summary, text, time) holds entries written on the contact; the composer on the contact's page (Add note, Log call, Log email, Log visit) writes them (`POST /api/contacts/people|organizations/<id>/activities`, `add_notes` for a note, `log_activities` for the rest). The contact's History is one list: its own entries, those of its deals, and for a company those written on its people ("on <name>"). "Last activity" in the lists counts them too. Follow-up tasks still belong to deals.

**Moving a person.** A correction tool, not a job change: a person with no deals can be filed under another company from Edit (an existing company is linked, a new name creates one, empty removes it; since §10.19: empty is no longer allowed). A person with deals stays where the deals are. Someone who changed employer is added as a new person at the new company: their work email changes with the employer, the old company's deals keep the old contact, and the mailbox watch keeps matching the old address to the old deals.

**Merging duplicates.** On a contact's page, Merge finds the other record of the same person or company (search by name) and folds it into the one on screen: its deals, notes and, for a company, its people move over (people of the same name are folded together, emails joined), empty details are filled from it, and it is removed (`POST …/<id>/merge { otherId }`; edit rights on both; audited as `organization.merged` / `person.merged`). Two people merge only inside one company, or when one of them has none.

**Earlier names.** `organizations.aliases` keeps the names a company had before a rename or a merge. The tracker import matches a sheet row to an existing deal by company name; it now also matches through these earlier names, so a company renamed or merged in the app does not come back as a new deal when the sheet still uses the old name.

Not built: automatic duplicate detection, undoing a merge.

### 10.17 Contacts timeline — built November 13, 2026

Contacts → Timeline: one row per person, one column per month of the last twelve, and in each cell how many calls, emails, visits and notes that month saw on the person's deals and on the person (`GET /api/contacts/timeline?q=&page=`, `contactsTimeline` in `features/contacts/repository.ts`; rules `timelineMonths`, `timelineCell` in the model). The dot grows darker with the count and its tooltip says "2 calls, 1 note"; the last column says when the person was last contacted. An empty stretch on the right is someone who has gone quiet. The name opens the person's page. Not built: the company view, a choice of period, filters by activity type.

### 10.18 Several pipelines — built November 13, 2026 (PD-09)

A sales team may run several pipelines; the team has one sales process today, so the feature is built to be invisible until a second pipeline exists.

**Model (migration 26).** `pipelines` (name, order, on/off, one default: "Sales pipeline") and `list_values.pipeline_id` on the `stage` rows; every existing stage belongs to the default pipeline. A stage name is now unique inside its pipeline (the unique rule on list values became list + pipeline + value), so two pipelines can both have a "Qualified". A deal is in the pipeline of its stage; no column on the deal.

**Administration.** List of values → Pipeline stage shows one pipeline's stages at a time: a row of pipeline buttons, "+ Pipeline" (it starts with one stage, "New"), Rename and Switch off for the others (`POST /api/pipelines`, `PATCH /api/pipelines/<id>`, privilege `manage_values`). Stages are added, renamed, ordered and switched off inside the pipeline shown. The default pipeline cannot be switched off; switching another off hides its board, and its deals keep their stage. Since §10.19 (PD-21, built November 16, 2026): Sales Managers also rename, add, reorder and delete stages from the board under `manage_stages`.

**Using it.** With two or more active pipelines the Deals board gets a picker; each pipeline has its own columns, counts and totals (`/api/pipeline?pipelineId=`). Wherever a stage is chosen (the add / edit dialog, the deal page, the stage filter, bulk move, the rules under Settings) the other pipeline's stages read "Pipeline: Stage" (`stageChoices`); picking one moves the deal to that pipeline. The stage bar on a deal shows the steps of its own pipeline (`stagesOfPipeline`).

**What stays with the default pipeline.** BD actions place and advance deals in the default pipeline only, and never pull a deal out of another pipeline (`stageAdvances`); "Recompute stages from BD actions" leaves other pipelines alone; the tracker import and deals without a stage land in the default pipeline. Insights and the KPI email list the other pipeline's stages as "Pipeline: Stage".

Not built: probabilities per stage, moving all deals of a pipeline at once, per-pipeline next-step suggestions (Settings → Pipeline next steps lists every stage).

### 10.19 Comments of November 16, 2026: company first, contacts inside companies, the board's width, views and card actions (designed and built November 16, 2026)

**Why.** The colleague who runs the server tried the live version (commit 1cb20ff) and on November 16, 2026 sent a comments document with four screenshots (kept outside the repository). It has thirteen points. The project owner agreed to all of them the same day and asked for the documents to be brought up to date before any code changes; the code followed the same day (as-built notes at the end of this section). The requirements are PRD §3.27 (PD-15..26); the points still to confirm with the colleague are PRD open question 17. The numbers below follow the order of the comments.

**1. A deal starts from a company (PD-15).** The first field of the add-deal dialog becomes **Company** (it was "Client name"). Typing lists the matching companies, including their earlier names (`GET /api/contacts/organizations?q=`). Picking one links the deal to it and fills the COMPANY side from the record. The **Contact** field (it was "Client executive") then lists that company's contacts, and picking one fills the CONTACT side (emails, phones, remark). A name that matches nothing can still be typed. Save then first shows what will be created ("New company: Acme Foods", "New contact: Jane Roe at Acme Foods") with **Create and add deal** and **Back**, and nothing is created until that is confirmed. The company is required. The contact stays optional, and such a card keeps saying "No contact yet". The server applies the same rule. `POST /api/leads` with a client name that matches no company and no `organizationId` is refused with 409 `confirm_create` and the names, unless the body carries `createOrganization: true`. A new contact name works the same way with `createContact: true`. The tracker import does not change: it still creates companies as it goes. Convert to deal in the Leads inbox goes through the same dialog.

*Duplicate guard.* Picking an existing company is deliberate, so it works like "+ Deal" on the company's page (§10.14): that company's own deals are not counted as duplicates. Instead, the dialog lists its open deals and their owners under the field ("Acme Foods has 2 open deals: … (Alex White)"), so no one works a company without knowing about the others. A new company still goes through the guard. The same email, website or phone on another company is refused with a link to it, and a very similar name gets a warning.

**2. "Person" is called "Contact" (PD-16).** This changes wording only, in everything a person reads: Contacts → **Contacts** (was People) / Companies / Timeline, "+ Contact", the deal page's Contact panel, the contact's own page, the merge texts, and the CONTACT side and Contact field of the add-deal dialog. Code, tables (`persons`), API paths (`/api/contacts/people`) and the addresses `#/contacts/people` and `#/person/<id>` keep their names.

**3. A contact always belongs to one company (PD-17).** "+ Contact" needs a company: either an existing one picked from the list, or a new one confirmed as in point 1. Edit can still move a contact without deals to another company (§10.16), but can no longer leave the company empty. Migration 27 makes `persons.organization_id` NOT NULL, and the one-name-per-organization rule then covers every row. On the live server no contact lacked a company on November 16, 2026. On other databases, a contact without one takes the company of its deal. A contact with no deal goes to a company named "Contacts to sort", where an administrator can move it with Edit. A company can have any number of contacts. A deal names one of them as its contact, or none.

**4. Several email addresses per contact (PD-18).** This is already built: `persons.emails` is a list, the forms take addresses separated by commas, and 75 contacts on the live server have more than one. Nothing changes.

**5. A deal's emails cover its whole company (PD-19).** For a deal, `/api/leads/<id>/emails` will search every email address of every contact of its company, plus the deal's own addresses. The Gmail search already matches From, To and Cc. The mailbox watch (§10.2) matches messages through the same addresses. A message with any contact of the company is stored for each open deal of that company (`lead_emails`) and updates their client and team last-email dates. Each owner is notified once. Colleagues still see a thread through any mailbox the watch matched it in. One limit is unchanged: only mailboxes connected through Sign in with Google are read. On November 16, 2026 the live server had one such mailbox, so the tab stays mostly empty until the team signs in with Google.

**6. The board uses the whole window (PD-20).** On the Pipeline page, the content width limit (1760 px, centred) is removed, so the board runs from the menu to the right edge of the window. The board takes the window's height below the toolbar. Each column scrolls on its own, and the board's horizontal scrollbar sits at the bottom of the window, always in view. Today that scrollbar is only reached below the tallest column (3,493 deals in Contact Made). On a 1920 px screen all seven stages show without scrolling. Other pages keep their width. The comment says "deal page", but its screenshot shows the board.

**7. Sales Managers edit the stages (PD-21).** A new privilege, `manage_stages` ("Edit pipeline stages"), is given to Admin and Sales Manager by default. On the board, **Edit pipeline** turns the columns into an editor:
- rename a stage in place;
- **+ Stage** between two columns or at the end;
- drag a column, or use its arrows, to reorder;
- delete a stage.

Delete asks where the stage's deals should go, archived ones included. It moves them, with a `stage_change` timeline entry for each. It also re-points the BD actions mapped to the stage, removes the stage's needs-attention rules and next-step setting, and then removes the stage itself. The last stage of a pipeline cannot be deleted. Older timeline entries keep the stage name they were written with. Every change is audited and applies to the whole team's board at once. New routes: `POST /api/pipeline/stages`, `PATCH /api/pipeline/stages/<id>` (name, order) and `DELETE /api/pipeline/stages/<id>?moveTo=<id>`. List of values → Pipeline stage keeps working for administrators. Adding and switching off pipelines stays with `manage_values`. The comment's "Leads Pipeline" is taken to mean the deals' pipeline, because the Leads inbox has no stages (open question 17).

**8 and 9. One actions button on the card (PD-22).** The mark at the card's top right is removed: the circle arrow for a planned or overdue next step, and the warning sign when none is planned. It looked like a button but did nothing, and the card's last line already says when the next follow-up is due or that none is planned. The ⋯ button, which today only moves the stage, opens a menu:
- **Move to stage**: the stages of the board's pipeline.
- **Add follow-up**: a date and an optional note. It works like Schedule follow-up on the deal page and follows the same next-step rules.
- **Add to To Do list**: the lists in order, "To be visited" first. The comment calls this the "Road trip queue": "To be visited" is where the team already parks a deal for a visit (open question 17).
- **Archive**: asks for confirmation. The card leaves the board, and the archive can restore it.

Each action needs the same rights as on the deal page.

**10. A date filter on the boards (PD-23).** Both board views get a **Date** filter next to the others: First contact or Follow-up, then From and To. A single day is From = To. First contact stands in for "created": the tracker's deals were all added on the day of the import, and a new deal's first contact date is the day it is added. The column counts and value totals follow the filter. `GET /api/pipeline` takes the names the deal list already uses: `firstContactFrom`, `firstContactTo`, `followUpFrom`, `followUpTo`.

**11. A board by status (PD-24).** A second board in the view switch (`#/deals/status`) has one column per active status, in List of values order: Cold, Warm, Hot, Client, Lost, Disqualified. It uses the same cards, paging and filters. Stage becomes a filter ("All stages" by default), and so does the pipeline when there are several. Dragging a card to another column changes its status under the deal page's rules: Lost and Disqualified ask for a reason, every change goes on the timeline, and Undo works as on the stage board. `GET /api/pipeline?groupBy=status`. The move uses the existing deal update. The stage board still leaves out Client, Lost and Disqualified.

**12. Emails on the deal page (PD-25).** The composer's "Log email" tab becomes **Emails**. It shows the threads from point 5, newest first, with **Send email** and **Reply** through the person's own connected mailbox, as History → Emails does today. **Log an email by hand** (today's Log email form) stays there for mail sent from elsewhere. History → Emails is removed, because it would show the same list. The timeline keeps its email entries. Without a connected mailbox, the tab says so and offers Sign in with Google and the hand log.

**13. The menu says "Pipeline" (PD-26).** The menu entry and the page title "Deals" become **Pipeline**. Its views stay: board by stage, board by status, list, archive and approval queue. The records are still deals ("+ Deal", "3,681 deals"). The addresses do not change (`#/deals…`), and `#/pipeline` already opens the board.

**Order of work.** The small changes come first: 13, 2, 8 and 6. Then 9, 10 and 11. Then 1 and 3 (migration 27), then 5 and 12, and 7 last. Each step ends with its tests.

**Tests.**
- Unit tests cover:
  - the stage-delete plan (where the deals go, and that the last stage cannot be deleted);
  - the confirm rule for new companies and contacts;
  - the company-wide address set;
  - grouping by status;
  - the date filter's parameters.
- Browser tests:
  - `09-pipeline`: the full-width board shows Contract Signed; the card menu's follow-up, To Do list and archive; a drag on the status board with the Lost reason; the date filter; a Sales Manager renames, adds, moves and deletes a stage.
  - `11-contacts`: the Contact wording, the required company, and a deal added by picking an existing company and contact, with the confirm for new ones.
  - `02-leads`: the Emails tab and the hand log.
  - The menu label "Pipeline".

**As built (November 16, 2026).** Everything above is in the code, with these differences and details:
- Point 1 (refined the same evening at the project owner's request): the browser's own suggestion list (`datalist`) was easy to miss, so the fields use our own list (`features/shell/SuggestInput.tsx`, a combobox the keyboard drives). Each field has a hint that says to start typing.
  - **Company** lists the matching companies with city, industry, open deals and contacts, and when nothing matches says that a new one will be created after a confirmation.
  - **Contact** lists the picked company's contacts, or, with no company yet, anyone's contacts with their company.
  - **Email(s)** looks up the contact who has the typed address (from three characters on). Picking a contact or an address fills the contact and its company together.
  - The "+ Contact" form's company field uses the same list.
  - The list of companies matches their current names (earlier names are not offered). The contact list appears once the typed name is an existing company. The dialog then sends that company's id, so its own deals do not count as duplicates, and it lists up to three of its open deals with owner and stage. A new company or contact gives the confirmation "Saving this deal also creates: …" with **Create and add deal** and **Back**. A name close to an existing deal ("Lakeshore Bakery Co" for "Lakeshore Bakery Co.") meets the duplicate guard first, with its link to that deal, before any confirmation is asked; "Save anyway" on a similar company carries over to the confirmation. The same rule guards "+ Contact" ("… is not a company yet", **Create company and save**). Code: `LeadFormDialog`, `ContactFormDialogs`, `newContactNames` in `features/contacts/repository.ts`, `app/api/leads/route.ts`.
- Point 3: migration 27 also changes the foreign key, so removing a company (allowed only without deals) removes its contacts; the remove dialog says so.
- Point 5: `organizationEmails` in `features/contacts/repository.ts`; the deal's detail returns `organizationEmails`; the watch's `findLeads` matches through the company's contacts, and `matchMessage` notifies each owner once per message.
- Point 6: the width limit is lifted with `.main-content:has(…)`; the board's height is the window's less 236 px; a column is at least 212 px wide, so at 1440 px the board scrolls sideways and at 1920 px all seven stages fit.
- Point 7: a new stage is added at the end and placed with the arrows (no "+ Stage" between two columns and no column drag). New Deal, where new deals start, can be renamed but not deleted. Code: `features/pipeline/stages.ts`, `StageEditor.tsx`, `app/api/pipeline/stages`.
- Points 8 and 9: `features/pipeline/CardActions.tsx`. The menu is drawn over the page, so a column's scrolling never cuts it off. **Take off To Do** appears when the deal is on a list.
- Point 10: a **Today** link fills From and To with today's date.
- Point 11: `#/deals/status`. There, a card shows its stage under the owner. Show more asks for `column`.
- Point 12: the hand log is the button **Log an email by hand** inside the Emails tab.
- Tests:
  - Unit: the stage order and delete rules, the board's grouping and dates, a contact needing a company, and the company-wide match with one notification per owner.
  - Browser: five new tests in `09-pipeline` (full width and no mark, date filter, card menu, status board with Lost and Undo, Edit pipeline). `02`, `08`, `09`, `11` and `12` follow the new labels, the confirmation and the card menu; the duplicate test in `08` became the open-deals notice.

**Not in this change:** Sales Managers adding or switching off pipelines, probability per stage, an automatic duplicate list, and Insights dashboards (§10.13).

### 10.20 Second and third comment files of November 16, 2026: deal source, adding from a stage, the activity form, data cleanup (built November 16, 2026)

**Why.** Later on November 16, 2026 the colleague sent two more versions of his comments file (kept outside the repository). Both repeat the thirteen points of §10.19 word for word, written against the live version, which did not have them yet. The second file adds four comments, numbered 14 to 17 here. The third file adds one screenshot of a deal page, which backs up comment 16. The project owner first asked for comment 14 alone, without the extra field the comment seemed to begin (its sentence is cut off: "add Referral to the list and …"), then for 15 to 17 the same evening. Requirements: PRD §3.27, PD-27 to PD-30.

**14. Deal source (PD-27), built.** The list `lead_type` keeps its key and its values, but is called **Deal source** wherever a person reads it:
- the add / edit dialog;
- the deal page's Summary;
- the "Any deal source" filters on the board and the lists;
- Insights (filter and breakdown);
- List of values;
- the tracker import's report.

Migration 28 adds **Referral** at the end of the list unless an administrator already added it. Insights already had a filter called "deal source" for whether a deal came from the leads inbox; that one is now called **Origin** ("Any origin"), so the two cannot be confused. The label is in sentence case ("Deal source"), like every other field. No "Source details" field was added.

**15. Adding a deal from a stage (PD-28), built.**
- The "+ Deal" button at the top of both boards goes; the quick-add "+" in the top bar stays.
- The "+" at the foot of each column is always visible, not only on hover.
- Each column head gets a "…" menu: **Add deal to this stage**, and **View deals in this stage in list view** (the list filtered by `stageId`).
- On the board by status, the "+" adds a deal with that column's status.
- "Import deals to this stage" is not planned; the tracker import is for administrators.

**16. Schedule an activity (PD-29), built.** One form replaces both the card menu's Add follow-up and the deal page's Schedule follow-up tab (the third file's screenshot shows it built into the deal page). The form has:
- the type (Call, Email, Visit, Task), with the title filled in from it;
- a date with a start and end time;
- priority;
- assigned to (the owner by default);
- a note;
- the deal, contact and company it belongs to;
- **Mark as done**;
- on the right, the assignee's agenda for that day, with previous and next day.

The task gets a type (a new column `tasks.activity_type`, default `task`). The deal's follow-up date moves as it does today. The Focus list then shows each item's type icon, priority, an overdue badge, the date, the assignee and the contact. This is a first step towards PD-10 (activities with types and a calendar).

**17. Ready-made filters and data cleanup (PD-30), built.** A **Filter** menu at the top right of both boards and of the list. It has ready-made filters:
- open deals (the default);
- lost deals and won deals (Client);
- archived deals;
- deals older than three months;
- quiet deals, past their needs-attention limit.

Its **Data cleanup** part has:
- deals in New Deal with no update for twelve months;
- deals with no stage;
- open deals owned by deactivated users;
- open deals whose expected close date has passed;
- open deals with no next step;
- open deals with no stage change for three months;
- open deals with no update for twelve months.

A chosen filter shows as a removable chip. The clean-up itself uses the list's bulk actions (archive, reassign, move to stage). "Add new filter" (saved filters) waits for PD-10.

**As built (15 to 17).**
- Point 15: the column's "…" menu is `ColumnMenu` in `PipelinePage.tsx`. **View deals in this stage in list view** opens `#/deals/list?stageId=…` (or `statusId` on the board by status) with the board's My deals / Everyone. The list now reads `stageId`, `statusId` and `quick` from the address. The list keeps its "+ Deal".
- Point 16: `features/tasks/ScheduleActivity.tsx` (`ScheduleActivityForm` inline in the deal page's composer under **Schedule activity**, `ScheduleActivityDialog` from the card's **Add follow-up**). Migration 29 adds `tasks.activity_type` (call, email, visit, task; earlier tasks named "Call …", "Email …", "Visit …" take that type) and `tasks.ends_at`. The task API takes `activityType`, `endsAt` and `done`, and `GET /api/tasks` takes `assigneeId`, `from` and `to` for the agenda; someone else's day needs `view_team_reports`, otherwise the agenda is your own and says so. The next-step prompt and the automatic stage follow-up set the type too. Mark as done stores the task as done with the timeline entry "Done: …". The deal's follow-up date moves only for an open activity. Focus items show the type icon, priority, an **Overdue** badge, the time slot, the assignee and the contact. The `scheduleFollowUp` helper is gone.
- Point 17: `features/leads/quick-filters.ts` (keys, labels, groups, the status rule, `monthsBefore`), `quick-filter-sql.ts` (one SQL clause per filter; quiet deals are worked out with the needs-attention rules), the `quick` parameter on `/api/pipeline` and `/api/leads`, and `QuickFilterMenu.tsx` on both boards and on the Pipeline list. **Archived deals** opens the archive view. On the board, **Open in the list** carries the filter to the list for its bulk actions. Lost and Won bring their closed deals onto the stage board. "No next step" is the Action Center's rule: no follow-up date from today on and no open task.

**Tests.**
- PD-27: the label is checked by the browser tests that open the add-deal dialog and the deal page; migration 28 runs in every browser-suite set-up.
- PD-28 to PD-30: `tests/unit/quick-filters.test.mjs` covers the keys, groups, the status rule and the month arithmetic. In the browser:
  - `09-pipeline`: the stage menu (add a deal to Qualified, open the stage in the list, no "+ Deal" on the board), and the Filter menu (no next step leaves out a deal with an open task, then Open in the list and clear).
  - `02-leads`: Schedule activity (the type sets the title, a visit with an end time and high priority shows in Focus).
  - The card menu test in `09` uses the new form.

### 10.21 Review of November 18, 2026: stage arrows, archival reason, Clients, Sales Trips (built and released November 18, 2026)

**Why.** The colleague's review file of November 18, 2026 (kept outside the repository; seven pages with screenshots of the reference application's add-deal and archive screens) and the requests that followed in the same session. PRD §3.28, PD-31..53; readings to confirm in PRD open question 18.

**Add deal.**
- **Pipeline stage arrows (PD-31).** `features/pipeline/StagePicker.tsx` replaces the stage drop-down in the add / edit dialog: one arrow per active stage of the deal's pipeline (`stagesOfPipeline`), the bar rounded at both ends with white chevron gaps (CSS `clip-path`), the first arrow without a notch and the last one flat. Arrows up to the chosen one are filled with a green worked out from their position, from `rgb(143,212,166)` to `rgb(31,107,60)` (`--stage-green`); hover and focus darken that shade. A line under the bar names the stage ("Qualified · stage 3 of 7"). With several pipelines a pipeline picker comes first and choosing one picks its first stage. The arrows follow the stage order of the pipeline, as Edit pipeline leaves it.
- **Contacts inside the company (PD-32).** `LeadFormDialog` no longer calls the people search: the Contact and Email suggestions come from the matched company's contacts only, and the Contact field is disabled until a company is typed. When the dialog opens from a company's page (`contact.organizationId`) the company is loaded at once, so its contacts are offered there too (until then that path had no lookup at all). The server's order was already right (§10.19): the company is created first and the contact inside it; the confirmation now says "First, the new company …" / "Then, inside it, the new contact …".

**Pipeline.**
- **Card menu (PD-33).** `CardActions` lists Add follow-up, Add to To Do list, **Convert to Client** and Archive; Move to stage went. Convert to Client updates the status to Client (`PATCH /api/leads/{id}`), and the board, which leaves clients out, drops the card on reload.
- **Archival reason (PD-34).** `features/leads/ArchiveDialog.tsx` (reason required, notes optional) is used by the card menu, the deal page and the list's bulk archive. `setLeadState` takes the reason id (migration 30, §3.27, §6.4). The Archive list has **REASON** and **NOTES** columns; the deal page's note reads "Not Hiring: notes".
- **Quarters (PD-37).** `quick-filters.ts`: `quarter_0` … `quarter_3` and `older` in a "By quarter" group, labelled from today (`quickFilterText`: "Current (Q4: Oct–Dec 2026)", "Q3: Jul–Sep 2026", …, "Quiet Deals (2025 & Older)" while the oldest listed quarter is a Q1, else "Quiet Deals (before Q2 2026)"). `quick-filter-sql.ts` compares `first_contact_date` with the quarter's first day and the next quarter's first day. `old_3m` and `quiet` were removed (the board's Quiet mark is unchanged).
- **Followup (PD-38).** `QuickFilterMenu` takes a `followUp` period: the entry after Open deals opens the By Period calendar next to the Filter button; the applied period shows as a chip ("Follow-up: Mon, Nov 16 – Fri, Nov 20, 2026", × clears it). On the boards it sets the date filter of PD-23 to the follow-up date; on the list it sets `followUpFrom` / `followUpTo`.

**Clients and To Do.**
- **Clients (PD-35).** A menu entry `clients` (before Insights) renders the list view `client` (status Client) as a page of its own; `#/client` points to it.
- **To be visited (PD-36).** The deal was saved on the list; the To Do page opened on My deals and hid a colleague's deal. It opens on Everyone now.

**Sales Trips (PD-39..41).**
- Code: `features/visit-trips/` (`model.ts` with the filters, the delete choice and `recentTripsLimit`; `repository.ts`; `SalesTripsPage.tsx`, `SalesTripPage.tsx`, `TripDialogs.tsx` with the new-trip, add-to-trip, add-deals and delete dialogs; `TripTable.tsx`, shared with the planner), routes under `app/api/visit-trips/` (§6.18), tables in §3.27.
- **From To Do.** Selected deals → **Add to sales trip**: a new trip (title, date, salesperson for managers) or an upcoming To Do trip; then the trip's page opens. The deals leave "To be visited".
- **The list.** Menu entry **Sales Trips** (before Clients). My Trips / Everyone (administrators start on Everyone), a user filter under Everyone, **By Period**, and the search of §6.18. Columns: date (Today / Past), title with its kind ("To Do deals", or "Planner · address"), salesperson, companies, stops (deals, or companies of a planner trip), delete (To Do trips only).
- **A trip's page.** The deals in visiting order with contact, phone, address, status, stage and owner; Add deals (from "To be visited"), take one off (back to its list), Edit, Delete. Delete asks: Move back to To Do (default), Keep in the Pipeline only, or Archive the deals (Archival reason and notes; offered only with `archive_leads`).
- **Planner trips (PD-41).** `GET /api/visit-trips` unions `visit_trips` and `sales_trips` (§6.18); a planner row opens on the planner's page (`#/trips/<id>`). The planner's list is **Recent Planned Trips**: `recent=1`, ten to a page, capped by List of values → "Recent Planned Trips (How Many)" (`recent_trips_limit`, a fixed list with one value; not a whole number from 1 to 500 → 30).

**By Period (PD-39, PD-38).** `features/shell/DateRangePicker.tsx`: `PeriodCalendar` (a month grid, Sunday first, today outlined; a click picks a day, a second click the other end, the range shown as a band while hovering; Apply, Cancel, Escape) drawn with a portal at a fixed position next to its anchor, moved to stay inside the window and above the anchor when there is more room there; it closes on scroll and resize. `DateRangePicker` is the button around it ("By Period", or the period, with × to clear).

**Lead Disqualified Reason (PD-43).** `fixedListKeys` keeps only `recent_trips_limit`, so the `disqualified_reason` list takes new values and can switch values off (LEAD-06's five reasons stay); List of Values calls it Lead Disqualified Reason.

**Deleting a stage from List of Values (PD-44).** `features/admin/DeleteStageDialog.tsx`, from a **Delete** button on each Pipeline Stage row (not New Deal; `manage_stages`). It first asks `GET /api/pipeline/stages/{id}` → `{ stage, deals: { active, queued, archived, total } }` (`stageDealCounts`). No deal: Delete stage. Deals: the stage cannot be deleted as it is; **Move them to another stage, then delete** (a stage of the same pipeline, then `DELETE /api/pipeline/stages/{id}?moveTo=`) or **Move them myself** (opens `#/deals/list?stageId=…&scope=everyone` for the bulk Move to stage). The server keeps refusing a stage with deals and no `moveTo` (`stageDeleteProblem`).

**Sales Trip Planner settings (PD-45).** Two more single-value lists, `trip_max_radius_km` and `trip_max_results` (migration 32, value 50 each), join `recent_trips_limit`; `numericListBounds` gives each a range (1–200 km, 1–60 results, 1–500 trips) that `PATCH /api/list-values/{id}` enforces, and `listNumber` reads them with a fallback. `POST /api/trips` checks a search against them (`tripLimits`, `parseTripInput(body, limits)`), and the planner's form shows them. List of Values lists these three and Business Type on one **Sales Trip Planner** page instead of four entries, in four tabs: **Business Type** (the list, open by default), **Max Radius**, **Max Results** and **Recent Trips Size** (each a number and Save, `TripPlannerSettings.tsx` with `only`).

**A–Z index (PD-46).** Contacts and Companies (`listPeople`, `listOrganizations`) and the Pipeline list (`GET /api/leads?letters=1`) return `letterPages`: for each first letter (A–Z, "#" for anything else) the page its first name is on, in name order. The page draws a grey letter row before each new letter and an index down the right side (the window's height, letters scaled with it; greyed when empty); a letter opens its page and scrolls to it. On the Pipeline list a letter first sorts the list by client name A–Z.

**Activities in three views (PD-46).** `TasksPage.tsx` switches between the dashboard (unchanged), `ActivityList.tsx` and `ActivityCalendar.tsx` (`#/activities`, `/list`, `/calendar`). Tasks carry the deal's `contactName`, `contactEmail`, `contactPhone` and `organization`. `periods.ts` holds the periods (To-do: open; Overdue: open, due before now; the others by local day; weeks Sunday to Saturday), the week label and the side-by-side layout of overlapping activities (unit tests in `activity-periods.test.mjs`). The calendar: 48 px an hour, all-day row for activities due at midnight with no end, a red line at the current time, a click on an empty half hour opens a small box (type, subject, 30 minutes; Add, or Details... into the task dialog, which now has Type and starting values).

**Activity types and outcome (PD-47).** `taskActivityTypes`: call, meeting, task, deadline, email, lunch, visit (`tasks.activity_type` has no check constraint, so no migration). Migration 33 adds the `activity_outcome` list and `tasks.outcome_id`; `POST /api/tasks` takes `outcomeId` with `done: true`, `PATCH /api/tasks/{id}` takes `outcomeId` and clears it on reopening; Schedule an activity shows Outcome once Mark as done is ticked, the task dialog on a done task. The deal's timeline reads "Done: Call Elena — Left voicemail".

**Adding as new (PD-48).** `SuggestInput` takes `icon`, `create` (the last option, "+ Add '…' as new …", reachable with the keyboard) and `isNew` / `onClear` (the blue NEW badge and ×). Add deal offers it for the company (no company of that name in the answer) and the contact (no contact of that name in the company); the pick sends `createOrganization` / `createContact` with the save, so the 409 `confirm_create` question is skipped. Add contact does the same for its company.

**Schedule an activity (PD-49).** `TaskFormDialog.tsx` (same props, so Activities, the top bar's + Activity, the calendar's Details... and the deal page all open it) has the form on the left, with `DayAgenda.tsx` on the right (the assignee's day, 40 px an hour, the slot being scheduled in it; also used by the deal's Schedule activity form). Migration 34: `tasks.note` (the yellow note; `description` stays the longer text) and `task_attachments` (`id`, `task_id`, `uploaded_by`, `file_name`, `mime_type`, `size_bytes`, `storage_key` under `tasks/<id>/`, `created_at`; deleted with the task). Routes: `GET`/`POST /api/tasks/{id}/attachments` (multipart `file`; the deal file types, 15 MB), `GET`/`DELETE /api/task-attachments/{id}`; audited as `task.file_uploaded` / `task.file_removed`. Files picked in a new activity are uploaded once it is saved.

**Activities linked to a company and a person (PD-50).** Migration 35 adds `tasks.organization_id` and `tasks.person_id` (set null on delete; existing activities on a deal take the deal's). `POST`/`PATCH /api/tasks` take `organizationId` and `personId`; the person must be a contact of the company (400), and with only a person the person's company is used; a new activity on a deal with neither takes the deal's. A task's contact, email, phone and company are its own, else its deal's. In the dialog a NEW company is created first (`POST /api/contacts/organizations`), then a NEW person inside it (`POST /api/contacts/people`), then the activity.

**No duplicate contacts by email or phone (PD-51).** `findContactClash` / `assertNoContactClash` in `contacts/repository.ts` (keys `emailKey`, `phoneKey` in `contacts/model.ts`, unit tests in `contact-keys.test.mjs`): `createPerson`, `updatePerson` (the emails and phones the edit adds) and `POST /api/leads` when the deal brings a new contact answer 409 `contact_exists` with the other contact's `personId` and a message naming them.

**Several people, priority chips, the note (PD-52).** Migration 36: `task_persons` (`task_id`, `person_id`, `position`; deleted with either), filled from `tasks.person_id`, which stays the first person. `POST`/`PATCH /api/tasks` take `personIds` (each a contact of the company, 400 otherwise); a task carries `people`. In the dialog the people are chips (NEW ones are created inside the company on save), `PriorityPicker` shows the priorities as coloured chips, and Description, Checklist, Note and Files are one row of links before the outcome, each opening its section in the same place, one at a time.

**Several team members (PD-53).** Migration 37: `task_assignees` (`task_id`, `user_id`, `position`), filled from `tasks.assignee_id`, which stays the first. `POST`/`PATCH /api/tasks` take `assigneeIds` (active users; at least one); a task carries `assignees`; `GET /api/tasks` for a person includes the activities they are one of the assignees of; `canManageTask` lets any assignee edit; the ones added are notified (`task_assigned`).

**Menu (PD-42).** The left menu items are in Title Case, and so are the list names of List of Values (`listKeyLabels`: Deal Source, Status, BD Action, Pipeline Stage, Client Response, Deal Category, Company Size, City, Lost Deal Reason, Disqualified Reason, Business Type (Sales Trips), Not Relevant Reason (Leads), To Do List, Archival Reason, Recent Planned Trips (How Many)); the page headings are not.

**Tests.**
- `tests/unit/quick-filters.test.mjs`: the groups, the quarter arithmetic (`quarterOf`, `quarterBefore`, `quarterRange`) and the labels on November 18, 2026 and February 1, 2027.
- In the browser (written November 18, 2026 without a local Docker run; GitHub Actions runs them):
  - the Title Case menu and List of Values names throughout;
  - `02-leads` and `09-pipeline`: archiving with an Archival reason and notes, both shown in the Archive;
  - `09-pipeline`: cards move by dragging (`moveCard`), the card menu has no stages, the stage arrows (`stagePicked`), Convert to Client and the Clients page, the quarter entries and Quiet Deals, Followup on the calendar (`pickPeriod`);
  - `11-contacts`: the Contact field waits for a company, then offers its contacts by email;
  - `12-pipelines`: the pipeline picked above the arrows, the board's columns (`boardStages`);
  - `13-sales-trips` (new): a To be visited deal onto a new trip and off the list, the Sales Trips search and By Period, the delete choices with Move back to To Do.
- Checked by hand against a local stack on November 18, 2026: every API path of §6.18 including the three delete choices, the search fields, the planner union and the Recent Planned Trips cap; archiving with and without a reason; the quarter filters on the board and the list.

### 10.22 Company in place of Organization (November 19, 2026, PD-54)

What the screens called an organization is a **company**. The change is one of words, like the one of §10.13 for deals and leads:

- **Changed:** every label, heading, placeholder, hint, toast and error text a person reads, in the screens and in the answers of the API (for example "Enter the company's name."); the Contacts tab reads Contacts, Companies, Timeline.
- **Addresses:** a company's page is `#/company/<id>` and the tab is `#/contacts/companies`. `routeAliases` in `AppShell.tsx` reads `company` as the `organization` view, so `#/organization/<id>` and `#/contacts/organizations` (bookmarks, old emails) keep working.
- **Unchanged:** code names (`OrganizationPage`, `organizationId`), the tables and columns (`organizations`, `organization_id`), the API paths (`/api/contacts/organizations`) and the audit codes (`organization.created`, entity type `organization`). Text stored before the change is not rewritten.
- **Tests:** the browser tests use the new labels (`11-contacts`, `02-leads`, `08-opportunities`); the unit tests check the new messages.

### 10.23 Card menu, Quick filters, one activity dialog (November 19, 2026, PD-55..57)

- **Move to stage (PD-55).** `CardActions` takes `stages` and `onMove` again. The menu's first line, Move to stage, opens the stages under it (folded when the menu opens, the current stage marked and disabled); a pick calls the board's `move`, the same path as a drop. The review of November 18 had removed the stages from the menu; without them a deal could not change stage on the board from a phone, where a card cannot be dragged.
- **Quick filters (PD-56).** `QuickFilterMenu`'s button and menu are named Quick filters; nothing else changed.
- **One dialog (PD-57).** `TaskFormDialog` is the only activity form. The deal page's composer tab and the board card's Add follow-up open it with `leadId`, so the deal, its company and its contact are linked on opening. Two things the removed form (`ScheduleActivityForm`) did moved into it: with `setFollowUp` (passed where the person may edit the deal) a new open activity writes its date to the deal's `follow_up_date`, and the subject offered is `taskTitleWords[type]` plus the first linked person. `onSaved` now also hands over a message ("Visit scheduled for 2026-11-23", "Call recorded as done"). `ScheduleActivity.tsx` keeps only `activityIcons`; the styles of the removed form are deleted.
- **Tests.** `09-pipeline`: Move to stage from the card menu; Add follow-up through the dialog. `02-leads`: an activity scheduled from the deal page (subject from the contact, time slot, priority, note).

### 10.24 Add company → Website → Fetch (November 19, 2026, PD-58)

- **Dialog.** `OrganizationFormDialog` puts Website second: a text field (`inputMode="url"`; `https://` is added on blur when missing) with a **Fetch** button, posting to `/api/contacts/organizations/lookup` through `lookupWebsite`. A field is filled when it is empty or still holds what an earlier Fetch put there (`autoFilled`); an edit never takes the fetched name. The city is the City list value equal to the address's town (accents ignored), else the longest City value the address contains. The note under the field lists what was filled and, in red, what was not found (name, city, address; never the industry) and a town missing from the City list. When `details.country` is set and is not Canada, the details wait in `abroad`: a yellow box names the country and the address and asks "Are you sure you want to add this company?" (Yes, fill in the details / No); nothing is filled before Yes.
- **Reading a page (`websiteDetails.ts`, pure, unit-tested).** Name: a JSON-LD organization's `name`, `og:site_name`, then the part of the `<title>` that matches the domain; a title that is only a tagline gives way to a logo's alt text or SVG title matching the domain, else the domain. Address: JSON-LD `address`, microdata, `<address>`, then a street address in the text (civic number, a street word, town, province or state and postal or ZIP code, or the province written out without a code), the one after "Head office" / "Headquarters" first; then script data (JSON escapes undone) and Google Maps links (`?q=`, `/maps/place/`; not bare coordinates). Industry: the schema.org type (Dentist → Healthcare, LegalService → Legal Services, …), a JSON-LD `industry`, else the industry whose words the title, description, keywords and h1/h2 use most. Country: JSON-LD `addressCountry`, else the address (Canadian postal code or province → Canada, ZIP code → United States, a country name at the end), else a country domain (`.ca`, `.co.uk`, `.de`; not `.io`, `.co`, `.ai` and the like).
- **Fetching (`websiteLookup.ts`).** `node:http(s)` with a `lookup` that refuses names resolving to private, loopback, link-local, shared or reserved addresses (checked when the connection is made, so a rebinding name gains nothing; an IPv4 address written inside IPv6, as a URL writes `[::ffff:127.0.0.1]`, is judged as that IPv4 address; `websiteGuards.ts`); ports 80 and 443; redirects followed by hand (at most 4) and checked again; 2 MB and 8 seconds per page; HTML only. Each page is read within 2 seconds (`readWithin`, a `node:vm` time limit): a malformed page that would keep the regular expressions busy for minutes is stopped and the dialog says the page could not be read. Without an address on the home page, up to four more pages within 20 seconds: the linked Contact us page, then locations, offices and about pages (`contactPageLinks`), and `/contact-us`, `/contact`, `/contactus` when no contact page is linked.
- **Google Maps.** Still no address, `MAPS_API_KEY` set and not `TRIPS_PROVIDER=stub`: one `places:searchText` for the name with the planner's field mask, metered as `places_text_search` through `createMapsMeter` (skipped when the month's budget is spent). `pickPlace` takes the place whose website is the same site (subdomains count), else one of the first three with the company's exact name (Inc, Ltd, LLC and the like ignored), else none. Its formatted address gives the town and the country; `addressSource` is `"google"` and the note says "address (from Google Maps)". A failed search is logged and the website's details are returned.
- **Tests.** `tests/unit/website-details.test.mjs`: JSON-LD, Open Graph and text addresses, the name fallbacks, Canadian and US addresses, head office first, script data, Maps links, the industry guess, contact links, the country rules and the Google place choice.

### 10.25 Leads with their own fields, the deal trimmed, nested contact dialogs (November 19, 2026, PD-59..65)

- **Status filter (PD-59).** `StatusFilter` (`features/shell`) replaces the status `<select>` on the board and the Pipeline list: a button with the chosen `StatusPill` or "All", a menu of the statuses as pills, reusing the Priority picker's styles.
- **Lead Gen Tool (PD-60).** Migration 38 adds `lead_type` `lead_gen_tool` "Lead Gen Tool" (unless a value of that name exists). `leadGenToolSourceId` (`features/list-values/model.ts`) finds it by code or name. Lead Discovery's Create a deal calls `openNewLeadFor` with it, the company name and the website; the job searches' runner stores it as a new card's `lead_type_id`.
- **The lead's fields (PD-61).** Migration 39: `opportunities.lead_type_id`, `bd_action_id`, `client_response_id`, `note`, `added_by`; cards found by the searches get Lead Gen Tool, cards of the tracker import the source, action and response of their draft; every deal with a BD action or client response gets `BD Action : <value>` / `Client response : <value>` appended to `comments` (the columns stay). Before that it copies every deal's `comments` and `expected_close_date` into `leads_before_migration_39`, so this change and migration 41 can be undone from the remote client (`UPDATE leads l SET comments = b.comments, expected_close_date = b.expected_close_date FROM leads_before_migration_39 b WHERE b.id = l.id`); drop the table once the release is confirmed. `parseLeadEntry`, `createManualOpportunity` (company key and `findDuplicateLead` checks, `added_by`) and `updateOpportunityDetails`; `LeadEntryDialog` on the Leads page. `prefillFor` gives Add deal the lead's source as `leadTypeId` and its note, `bdCommentLines(bdAction, clientResponse)` and "Other contacts: …" as comments. The deal screens drop the two fields (`LeadFormDialog`, `DealPage`, `LeadListPage` filters, `LeadTable` and Action Center "LAST ACTIVITY", board cards "Last activity"); `LeadInput.bdActionId` / `clientResponseId` are optional and the API still takes them. The tracker import writes `withBdLines(comments, action, response)` (earlier pair replaced) instead of the columns and still places a new deal by `stageIdForAction`; its draft cards store the source, action and response.
- **Company and contacts (PD-62).** Migration 40: `opportunities.organization_id`, `opportunity_persons (opportunity_id, person_id, position)`. `checkLeadEntry` takes the company's own name and refuses a contact of another company; `contacts` is read with `json_agg`. Convert to deal passes `contact={ organizationId, personId: first }` to `LeadFormDialog` and the first contact's name as `clientExecutive`.
- **Nested dialogs (PD-63).** `Dialog` renders through `createPortal` into `document.body`, keeps a stack so Escape closes only the top one, and stops `submit` at its edge (a portal still bubbles React events to its parent). `OrganizationFormDialog` and `PersonFormDialog` take `initialName` (shown as new) and `onUseExisting`; Add deal, Schedule an Activity, Add lead and Add contact open them from the "+ Add … as new" option and link the saved record (`linkOrg`, `linkPerson`). In the activity and lead contact fields, `typePerson` commits the name before a comma. Fetch replaces a new company's name.
- **Deal page (PD-64, PD-65).** `SidePanels` takes only `detail` and `overdue` (no stage or To Do selects). `ConvertToClientDialog` (`features/shell/components.tsx`) asks before Client: the deal page's status menu (which no longer lists Client unless the deal is one), `PipelinePage` (`confirmClient` for the card menu and a drop on Client; Undo does not ask), and `LeadFormDialog` (the status is set on Yes and saved with the form).
- **Tests.** Unit: `tests/unit/lead-fields.test.mjs` (`withBdLines`, `parseLeadEntry`), `list-values.test.mjs` (`leadGenToolSourceId`). Browser: `08-opportunities` (Add lead through Add company and Add contact, the comma, convert with source and comments), `02-leads` (no BD action, client response, stage or To Do control on the deal), `09-pipeline` (the stage bar; the Client confirmation), `10-todo` and `13-sales-trips` (To be visited through the bulk action).

### 10.26 Clients apart from the pipeline, + Client, contracts (November 19, 2026, PD-66..68)

- **One record, client mode.** A client stays a `leads` row with status `client` (the project owner's choice over a separate table: its activities, files, emails, tasks, messages and audit stay linked). `DealPage` reads `isClient`: eyebrow CLIENT / ARCHIVED CLIENT, no `StageBar`, the status as a plain `StatusPill`, and **Move back to pipeline** (`MoveBackDialog`: an active stage from `stageChoices` and an open status, sent as `{ statusId, stageId, statusReasonId: null }`). `LeadFormDialog` in `editingClient` (and `addingClient`) mode: CLIENT DETAILS, no `StagePicker`, Deal source and Status as disabled inputs, **Closed Date** for `expectedCloseDate`. `LeadTable` shows CLOSED DATE in the Clients view and "—" as a client's stage elsewhere; a company's page lists it as Client.
- **Closed Date.** `updateLead`: a change to Client sets `expected_close_date` to today unless the request gives one; moving back keeps it. `createLead`: a new client without a date gets today. Migration 41 fills existing clients from their last change to Client on the timeline, else the contract-signed date, else `updated_at`.
- **+ Client.** The Clients view of `LeadListPage` calls `openNewLeadFor({ prefill: { statusId: client, expectedCloseDate: today } })`; `LeadFormDialog` recognises `addingClient` from the prefilled status (title Add client, Save client); the toast reads "… added to Clients".
- **Contracts.** `attachmentCategories` gains `contract` (`lead_attachments.category` is free text, so no migration); the upload route accepts it; the timeline and the owner's notification read "Contract uploaded". `DealPage`: a **Contracts** tab (`FilesTab` with `category="contract"`, a name field) and **Upload contract** in the header, which opens it and scrolls to History. Add client's optional **Contract** file is sent with `uploadAttachment(..., "contract", "Contract")` after the client is created; a failed upload leaves the client and says so.
- **Tests.** `09-pipeline`: after Convert to Client, the client's page (CLIENT, no stage bar, Closed Date) and Move back to pipeline to Qualified.

### 10.27 Lead Generation apart from Leads; the Preview section (November 19, 2026, PD-69)

- **Origin.** `opportunityOrigins` = `manual` | `found`. A card is `manual` when `added_by` is set (Add lead), `draft` is set (tracker import) or it has no job listings (a tracker card whose draft was cleared on conversion); every other card is `found` (the job searches). `GET /api/opportunities?origin=` filters the list and the per-status counts; an unknown origin is a 400; no origin lists all.
- **Pages.** `OpportunitiesPage` takes `origin`. `#/leads` (`manual`): LEADS INBOX, Add lead, no searches. `#/lead-generation` (`found`, under TOOLS, `view_leads`, hidden for recruiters): eyebrow TOOLS, **Execute** (primary; runs the searches now), **Budget** (`button-soft`) and the Searches & runs tab. The sidebar counts the new cards of each (`leads`, `found`).
- **Preview.** The preview page once called Lead Generation is `LeadDiscoveryPage` at `#/lead-discovery`; it and the Road Visit Planner form a PREVIEW menu section (no per-item "preview" badge).
- **Tests.** `08-opportunities`: the search and Not relevant steps open Lead Generation; Add lead and the tracker steps stay on Leads.
- **Move to Pipeline.** `MoveToPipelineDialog` (both pages) replaces Convert to deal and its `LeadFormDialog`: active stages from `stageChoices`, open statuses (not `offBoardStatusCodes`; the tracker draft's status first, else Cold), the owner for `reassign_leads`. It posts `createLead` with `prefillFor(card)`, `opportunityId`, the card's company and first contact, `createOrganization`/`createContact`; a 409 duplicate shows its message and, when it may be overridden, **Move anyway** (`allowSimilar`). Leads (`manual`) hides the Converted and Existing deals tabs.
- **Scope.** `GET /api/opportunities?scope=mine`: on `manual`, `added_by` = the user; on `found`, a listing whose search `created_by` the user. Counts follow the scope; the sidebar counts everyone. Toggle: My Leads / Everyone, By Me / Everyone (default Everyone).
- **Budget.** Lead Generation no longer shows `JobsUsageCard` on the page: a **Budget** button opens it in a wide dialog (`inDialog`: no frame, the status pill in place of the title, the per-source notes shown; `empty` when no live source is set up).
- **Duplicate websites.** `websiteKey` (`src/lib/website-key.ts`): lower case, no protocol, no leading `www.`, no query, fragment or trailing slash; `sameWebsite` never matches two empty ones. 409 with the other record's name: Add / Edit company (another company; `organizationId` on create), Add / Edit lead (another lead, then a live deal or client), a deal's changed `companyUrl` (another deal or client, except deals of the same company). Adding a deal keeps its domain match (`registrableDomain`).
- **Pipeline card colour.** A card whose status is `hot`, `warm` or `cold` gets `pipeline-card-<code>` (the status pill colours as background, a 4px left edge) and no `StatusPill`; the label stays as the card's `title` and in an `sr-only` span. Other statuses keep the pill.

## 11. Security and deployment notes

- Run behind TLS; set `APP_URL` so the origin check and reset links use the public host. An `http://` `APP_URL` turns off the Secure cookie flag for deployments without TLS (internal hosts, the end-to-end stack); browsers drop Secure cookies over plain http on anything but localhost.
- The app database role has no DDL rights; schema changes go through `npm run db:create`, which runs as the PostgreSQL administrator (in production the `migrate` service, so the superuser password never enters the app container).
- `POST /api/admin/sql` (§6.16) lets an administrator, and therefore an API token of one, read and change any row the app role can reach, without the checks the screens apply. It was asked for on November 12, 2026 so that corrections need no shell on the server, with that trade-off stated. What bounds it: `manage_settings`, the app role (no table changes, no superuser functions), one statement per call, preview unless `apply`, a 30-second limit, and an audit entry per call with the full text (an administrator can also delete audit rows through it, so the trail is a record, not a control). Secrets in the database are hashes (sessions, API tokens) or encrypted with a key that is not in the database (Gmail tokens). `ADMIN_SQL=off` removes the endpoint; revoking the token stops a leaked one.
- The `deployer` (§2.4) holds the host's Docker socket and runs whatever the followed branch contains, so write access to that branch is write access to the server, and a private repository needs `DEPLOY_GIT_TOKEN` to be read-only. `DEPLOY_AUTO=off` limits it to deploys an administrator asks for.
- Attachments live outside the web root; downloads set `Content-Disposition`, `X-Content-Type-Options: nosniff`, and a sandboxing CSP.
- Session, reset, and 2FA secrets are stored only as hashes; cookies are httpOnly and SameSite=Lax.
- Error responses never include SQL or stack details; failures are logged server-side with context.
- Sign-in, reset, and 2FA attempts are rate limited in the database.
- Cookie names are `leadtrailpro_session`, `leadtrailpro_2fa`, and `leadtrailpro_gmail_state` since October 30, 2026 (formerly `salestrackpro_*`); since November 5, 2026 the state cookie is `leadtrailpro_google_state`, shared by Sign in with Google and the Gmail reconnect (§4). Deploying the rename ends every existing session: users sign in again, and a two-factor or Gmail-connect round trip that was in flight starts over.
- Outbound mail through Gmail or Google Workspace: Google refuses account passwords over SMTP (`534 5.7.9 Application-specific password required`, observed October 31, 2026) and accepts only an App Password (2-Step Verification on) or OAuth, which the mailer does not implement. Put the App Password in `SMTP_PASSWORD`, or keep `MAIL_PROVIDER=stub`; `npm run mail:test` shows which case applies. With `MAIL_PROVIDER=smtp` and a rejected password, each send fails and is recorded as `failed` in `mail_outbox`. Since November 6, 2026 the app sends through the Gmail API with OAuth instead (`MAIL_PROVIDER=gmail`, §7.17), so this applies only to the legacy SMTP mode.

---

## 12. Verification

- State on November 16, 2026 (night), after §10.20 and the suggestion lists: 192 unit tests in 27 files; 101 browser tests in 12 files, all passing in one full run; type check and lint clean; 29 migrations. New: `tests/unit/quick-filters.test.mjs`; the stage menu and Filter menu tests in `09-pipeline`; Schedule activity in `02-leads`.
- State on November 16, 2026, after §10.19: 189 unit tests in 26 files; 98 browser tests in 12 files, all passing in one full run; type check and lint clean; 27 migrations. New that day: the stage order and delete rules, the board's grouping and date filter in `pipeline.test.mjs`, the company-wide match in `gmail-watch.test.mjs`, the required company in `contacts.test.mjs`; five tests in `09-pipeline` (full-width board, date filter, card menu, board by status, Edit pipeline), the open-deals notice in `08`, and the new labels and confirmation across `02`, `04`, `06`, `11`, `12`.
- State on November 13, 2026 (night): 185 unit tests; 93 browser tests in 12 files (`01-auth` … `12-pipelines`); type check, lint and the production build clean. The counts are the same on master b5c9b46 (November 16, 2026: 26 unit test files, 26 migrations, no code change since); New on November 13, 2026: `tests/unit/contacts.test.mjs` and `deal-value.test.mjs`, the several-pipelines and pause cases in `pipeline.test.mjs` and `deploy.test.mjs`; `11-contacts.test.mjs` (contacts first, notes, move, merge, timeline), `12-pipelines.test.mjs`, the deal-value test in `09-pipeline`, the Releases test in `05-admin-reports`. The pause switch was also exercised on the server itself: with deploys paused a pushed commit waited, `deploy` released it, and the pause stayed on (§2.4).
- The browser suite is sensitive to a loaded machine (timeouts and elements redrawn between two steps); stop the development `app` and `jobs` containers before `scripts/e2e.sh`. The helper `wait()` looks an element up again when the page redraws it.

- `npm run typecheck`, `npm run lint`, `npm run build` must pass. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, and the unit tests on every push to master and every pull request, then the browser suite through `scripts/e2e.sh` in Docker; screenshots of failed browser tests are kept as a workflow artifact.
- `docs/TESTING.md` is the step-by-step guide for testers: Docker on a laptop, without Docker, and on a server with `compose.prod.yaml`, with `npm run db:check` as the first thing to run when the database does not connect; the table of connection errors and their fixes lives in the README (Troubleshooting), which the guide links to.
- `src/app/layout.tsx` types its props as `{ children: ReactNode }` instead of the generated `LayoutProps<"/">`, so `tsc` passes on a clean checkout before `next dev` or `next build` has written `.next/types` (fixed October 30, 2026).
- Status on October 31, 2026, after the rename and the Next.js 16.4.3 upgrade, in the rebuilt `leadtrailpro-dev` image: `npm run typecheck`, `npm run lint`, `npm run test:unit` (63 tests in 17 suites), and `npm run build` pass. GitHub Actions on `heypankajp/leadtrailpro` (the repository was renamed with the product; the old address redirects): the checks job has passed since 45f473f fixed the clean-install typecheck, but the browser job has failed at "Run the end-to-end suite" on every run since the workflow was added on October 25, 2026, so CI has never been green. Its logs need a GitHub sign-in and have not been read. The same suite passes locally on this tree (`scripts/e2e.sh` on October 31, 2026: 54 tests in 7 files, 0 failures), so the remaining difference is the GitHub runner's environment, not the code.
- Unit tests (`tests/unit`, `node:test` on Node 22 type stripping, `npm run test:unit`): the natural-language date parser (working days, relative phrases, weekday names, periods, month names, explicit spellings, times of day), the note follow-up suggestion rules, the status-reason helpers, the trip matching rules, and the needs-attention rule precedence.
- Job-source usage meter (§7.13): `tests/unit/jobs-usage.test.mjs` covers credits per call, HasData's balance parsing, calls left under budget and balance, the card line, the warning-level setting, and the alert texts; the live balance call was checked on November 7, 2026. Team board (§7.16): `tests/unit/analytics.test.mjs` covers the attention ordering and `05-admin-reports.test.mjs` asserts the board table renders. Opportunity searches (§7.14): `tests/unit/opportunities.test.mjs` covers title parsing, the OR query, the posted-within window, and the Settings defaults; `08-opportunities.test.mjs` adds a search through the titles field.
- Mailbox watch (MAIL-01, §10.2): `tests/unit/gmail-watch.test.mjs` covers period keys, the Gmail query, header parsing, direction, outside addresses, matching (client reply, client in copy, team-only, unknown), the awaiting-reply rule, and the scan loop with fakes (silent backfill, notification on a later client reply, stored messages skipped, unreadable message counted, page cap and watermark). Verified live on November 7, 2026 against a local stand-in for the token endpoint and Gmail (`GMAIL_API_URI`): backfill stored two matches without notifying, a later client reply notified the lead owner, stamped the lead, and surfaced it in the Action Center query and the `client_reply` sort; test rows removed afterwards.
- Sign in with Google (AUTH-03): `tests/unit/google-signin.test.mjs` covers the ID-token profile (verified email, name fallbacks, refusals), the state cookie round trip with its PKCE pair, the granted-scope check, and the redirect URI; the whole redirect chain, for sign-in and reconnect, was exercised on November 5, 2026 against a local stand-in for Google's endpoints (§10.1).
- Seed accounts: `tests/unit/seed-accounts.test.mjs` covers the CSV parser (column order, comments, role labels, stage default, optional password, per-line errors, header checks).
- Opportunity pool (OPP-*): `tests/unit/opportunities.test.mjs` covers the schedule settings and due check, search input, listing keys, grouping, and `decideCompany` for live, closed, archived, and absent leads and both not-relevant scopes; `tests/unit/job-search-mappers.test.mjs` covers the keyword-search mappers of Adzuna (with paging from `count`), JSearch, HasData (with the next-page cursor), and the generic contract; `tests/e2e/08-opportunities.test.mjs` adds a search, runs it on the sample source, assigns a card (pre-filled form, Timeline entry), hits the duplicate guard, and marks a card not relevant and back. On November 6, 2026 the API path was also exercised against the dev stack with only the sample source enabled: run, assign, a second assignment refused, the duplicate guard, not relevant, a second run keeping every status, the owner notification.
- Analytics (RPT-*): `tests/unit/analytics.test.mjs` covers bucketing, the status-over-time sweep, movement summaries, time-in-status spells and percentiles, the stalled assessment, and filter parsing; `05-admin-reports.test.mjs` checks the pipeline, stalled leads, leaderboard, and status-over-time sections on the Analytics page; on November 6, 2026 the endpoint was also exercised against the dev stack's imported data (3,615 active leads: 1.4 s warm for 30 days, 0.5 s for 12 months), with rolling and custom periods, filters, and the drill-down.
- End-to-end API suite (kept outside the repo during development) covers: first-run setup, bootstrap key lock-out, login and origin checks, seeding, reference data, role permissions for every mutating endpoint, queued review, edit/transfer rules, activities, lead 360 and audit visibility, tasks and checklists, uploads with versioning and type rejection, downloads, soft delete, dashboard, team and own reports, all periods, drill-down, list-value rename propagation and inactive-value rejection, settings, templates and assignment, user updates with extra privileges, bulk archive/restore/reassign, login history, admin and self password changes, SMTP-missing responses, termination cascade and session revocation, last-admin guard, audit action coverage, rate limiting, sign-out.
- Browser end-to-end suite (`tests/e2e`, Selenium + `node:test`, run with `scripts/e2e.sh` against a production build, an in-memory PostgreSQL, and a Chromium grid in Docker): first-time setup, sign-in, password change, a reset request accepted in stub mail mode, lead life cycle (create, BD action, timeline, note that offers a follow-up task, Emails tab without Gmail configured, follow-up task, document upload, edit, status, search, archive/restore), tasks (including a due date typed in words), user creation, a per-account sign-out time ending an older session, role-limited navigation, queued-lead approval, transfer, termination hand-off, list of values, settings, business-calendar holiday, target templates, report drill-down.
- Notifications and digests (TASK-06, NTF-*): `tests/unit/digests.test.mjs` covers the due-time and weekday rules; `tests/unit/kpi-report.test.mjs` (§7.18) covers the KPI report due rules (business days, the weekly day, the first of the month), the period keys, the totals status by status, the daily body (current state only, no period columns), the weekly body (the period's activity below the current state, or the nothing-recorded sentence), and the settings switches, and `05-admin-reports.test.mjs` sends the daily KPI report on demand and finds it in the stub outbox; `04-team.test.mjs` assigns a task to the new Sales Manager and checks the bell, the dropdown entry, and Mark all read; `05-admin-reports.test.mjs` sends the daily digest on demand and finds it in the outbox and the bell.
- Stub mail (MAIL_PROVIDER): `05-admin-reports.test.mjs` emails a set-password link from User management, opens it from the outbox under Settings, and completes the reset; the e2e stack runs with `MAIL_PROVIDER=stub`.
- Needs-attention rules (TASK-05): `tests/unit/inactivity-rules.test.mjs` covers rule precedence and validation; `05-admin-reports.test.mjs` adds a rule, reloads, and checks the Action Center heading; the same file filters the report by stage and fetches the PDF and Excel exports.
- Accessibility (NFR-07): `tests/e2e/07-accessibility.test.mjs` runs axe-core (WCAG 2.0/2.1 A and AA) on the sign-in screen, Action Center, lead dialog and timeline, lead list, tasks, reports, settings, list of values, user management, and the trip planner; serious or critical violations fail the test, lesser ones are printed. Found by the full run of November 11, 2026 (night): the Team board's muted role note (`.opp-table td small.muted-cell`, lightened to #8a90a6 with the team board on November 7) failed the contrast threshold on the Analytics screen; it now uses the standard muted colour (#62697b, 5.5:1), as do the small muted lines on the Opportunities tables.
- Status reasons (LEAD-06): `tests/unit/status-reasons.test.mjs` covers the reason-list mapping and the combined label; `02-leads.test.mjs` sets Disqualified with a reason from the lead header, checks the inline reason select and the timeline entry, and returns the lead to Warm.
- To Do lists (TODO-*, §10.12): `tests/unit/todo.test.mjs` covers the timeline wording of a move, the counts, and the tabs (All lists, active lists in order, a switched-off list only while it has leads); `10-todo.test.mjs` puts a lead on To be visited from its page and finds the timeline entry, sees it on the To Do page with the badge and the counts on the tab and in the sidebar, takes it off with the bulk bar, adds a second list under List of values, and moves the lead to it in bulk from All leads.
- Deploys and data corrections (§2.4, §6.16): `tests/unit/deploy.test.mjs` covers which statements the data-correction endpoint accepts (data statements only, comments and the closing semicolon dropped, `apply` only when exactly true, the `ADMIN_SQL` switch), commit comparison, the deployer's messages, the decision to deploy (moved branch, same commit, failed commit, request, automatic deploys off, an app that does not answer), repository addresses with and without a token, and the failure summary. Rehearsed by hand on November 12, 2026 against a production-style stack on macOS with a local test repository: the database upgrade before the app starts, a deploy asked for through the API, a pushed commit live in under a minute, a commit that does not build recorded as failed with its reason while the previous app kept running, recovery by the next push, the deployer restarting on the code it deployed, and the endpoint's preview, apply, refusals (two statements, a table change, a superuser view, an unknown column), and audit entries. Not yet run on the Windows server at the time; since November 13, 2026 the server deploys through the deployer and the pause switch was exercised there (first item of this section).
- Legacy tracker import (§10.9): `tests/unit/tracker-mapping.test.mjs` covers dates, BD-action prefixes and aliases, statuses, lead types, emails, phones, address detection, city clean-up, field merging, row fingerprints, and the pairing of edited rows; `tests/unit/tracker-import.test.mjs` covers the Sales Manager mappings, cell values, header detection and fingerprints on an in-memory workbook, the merge of a company's rows, the text report, the upload options, and the count ordering; the run itself is verified with `--dry-run` and through the API against the client's workbook (counts in §10.9). API tokens (§4): `tests/unit/api-tokens.test.mjs` covers the token format, hashing, bearer parsing, creation input, expiry, and usability; the bearer path was exercised on November 10, 2026 against the dev stack (session, users, tokens list, 403 for minting with a token, origin check waived, 401 after revocation); `05-admin-reports.test.mjs` creates and revokes a token in the browser and opens the Tracker import page. Pool cards from the tracker (§10.9): `tests/unit/tracker-import.test.mjs` also checks the pool's company key against the app's `normalizeCompanyName`, the report wording without a default owner, and the draft parsing (`trackerDraft`, `trackerCard`); `08-opportunities.test.mjs` uploads a two-row export whose company has no Sales Manager, previews and applies it, finds the card with its tracker entries, assigns it with the pre-filled form, and finds the sheet's entries on the lead's timeline.
- Task comments and rich-text notes (TASK-04, NOTE-03/04): `03-tasks.test.mjs` comments on a task with a mention picked from the suggestions, edits the comment, and removes it as an administrator; `02-leads.test.mjs` writes a note with the Bold button, checks the rendered emphasis, and checks that the dictation button is offered in Chromium.
- Job-listing sources (TRIP-06, §7.13): `tests/unit/job-sources.test.mjs` covers settings validation, routing (unconfigured, disabled, over budget), cache freshness, employment types, company matching, and the Adzuna, JSearch, and HasData mappings from sample responses; `05-admin-reports.test.mjs` checks the Settings section (sample source ready, Adzuna not configured, a budget change kept); `06-trips.test.mjs` exercises the layer end to end on the stub source. Verified by hand in stub mode: prefetch limit, Check on demand, cache rows, usage counters, and a re-run served from the cache.
- Collaboration (COLL-*, NOTE-03): `tests/unit/richtext.test.mjs` covers the inline and block parser, unsafe links, and the plain-text form; `tests/unit/messages.test.mjs` covers mention parsing, group expansion, and input validation; `02-leads.test.mjs` posts a message with bold, a list, and an @admin mention picked from the suggestions, replies with a quote, edits the reply, removes it as an administrator, and checks the tab count; `04-team.test.mjs` mentions the Sales Manager on a transferred lead and finds the mention in their bell; `07-accessibility.test.mjs` audits the Collaboration tab.
- Sales Trip Planner: `tests/unit/trip-matching.test.mjs` covers the matching rules; `tests/unit/trip-google.test.mjs` the Places and Routes mappers and field masks; `tests/unit/maps-usage.test.mjs` the Google Maps usage meter (settings, levels, counting per SKU, refusals before anything is spent, failed calls counted); `06-trips.test.mjs` plans a trip on the stub provider, checks the recognised lead, the job listings, shortlist and planned visit, filters, the Excel export, and the trip list.
- Pipeline board (PIPE-*, §10.11): `tests/unit/pipeline.test.mjs` covers the stage of a BD action (mapped, unmapped, none, a missing entry stage, no stages), the forward-only advance, the next step of a card, quiet days, the card order, and filter parsing; `tests/e2e/09-pipeline.test.mjs` creates a lead, finds it in New Deal, moves it through the Move to… select, undoes the move from the bar, sets a BD action from a later stage on the lead page and checks the Stage field, the timeline entry, and the new column, and narrows the board by status; `05-admin-reports.test.mjs` changes a BD action's stage under List of values and runs Recompute stages. Drag-and-drop itself (HTML5 drag events) is outside what Selenium drives reliably; the drop handler calls the same move as the select. The board, search, Show more, and the lead list's stage filter were also exercised on November 11, 2026 against the dev database (§6.15).
- Pipeline Phase 2 (PIPE-08..10, §10.11): `tests/unit/inactivity-rules.test.mjs` adds the stage precedence cases (stage alone, status + stage, a BD action rule over status + stage, no stage on the lead) and a stage-only rule through `normalizeInactivityRules`; `tests/unit/pipeline.test.mjs` adds `defaultNextStep` (business days over a weekend and a holiday, zero days, no suggestion, no stage) and `normalizePipelineSettings` (defaults, nulls dropped, bad activity, day bounds, bad key); `09-pipeline.test.mjs` skips the prompt after a move, saves a next step from the prompt after a BD action (pre-filled "Call Adam Reid" from the Profile Shared suggestion) and finds the task on the timeline, and checks the Action Center's No next step panel lists a fresh lead and not the one with a task; `05-admin-reports.test.mjs` adds the seventh rule next to the six seeded stage rules ("7 rules by status, BD action, or stage" on the Action Center) and saves a per-stage next step under Settings → Pipeline. `02-leads.test.mjs` skips the prompt after its BD action change and its logged call (the only older flows that trigger it); without that, the prompt sits on top of the lead dialog, the file runs past its 120-second limit, its browser session is never released, and every later file waits for a session until it times out, which is what the first full run after Phase 2 showed.
- Pipeline Phase 3 (PIPE-11/12, §10.11): `tests/unit/analytics.test.mjs` adds `summarizeStageMoves` (entered per stage, forward and back in board order, unknown codes counted but not ranked); `tests/unit/kpi-report.test.mjs` asserts the "Pipeline by stage" line in the text and HTML bodies and its empty wording; `09-pipeline.test.mjs` moves a lead from the stage bar after the confirmation (current step shown, then the prompt skipped and the card in the new column) and moves two leads from All leads through "Move to stage" (toast and the Stage column); `05-admin-reports.test.mjs` checks the By stage, Stage over time, and Time in stage sections render on Analytics.
