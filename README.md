# SalesTrackPro

SalesTrackPro is a sales workspace for a staffing and recruitment business, built from the Sales Tracker BRD/SRS. Leads, interactions, tasks, documents, candidate profiles, targets, reports, users, and the full audit trail live in PostgreSQL behind a Next.js application. Phase 1 (the core workspace) is implemented; collaboration, notifications, and the external integrations are planned. The requirements with their status are in [docs/PRD.md](docs/PRD.md) and the technical design in [docs/SPEC.md](docs/SPEC.md).

## At a glance

| | |
|---|---|
| Stack | Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 5, PostgreSQL 17 (14 or newer works), hand-written CSS |
| Packaging | Docker: hot-reloading development stack, standalone production image, one-shot setup service |
| Tests | ESLint, `tsc`, production build, unit suites for the date parser, status helpers, trip matching, and reminder rules, and a 47-test Selenium browser suite with an axe-core accessibility audit, all in Docker |
| Email | Password resets, set-password links, and two-factor codes work in stub mode (`MAIL_PROVIDER=stub`, messages recorded under Settings → Email delivery) until `SMTP_*` is configured and `MAIL_PROVIDER=smtp` |
| Sales trip planner | Built from the October 2026 change note; runs on sample company data until `MAPS_API_KEY` and a job-listing source are configured |
| Preview pages | Lead generation and the road visit planner show sample content until data sources are connected |

## Quick start with Docker

Requires Docker Desktop, or Docker Engine with the Compose plugin. Nothing else is installed on the machine: Node 22 and PostgreSQL run in containers, and the project directory is mounted into the app container so edits hot-reload as usual.

```bash
docker compose run --rm setup   # once: creates the schema, the restricted app user, and .env.local
docker compose up -d            # dev server at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), choose **First time setup**, and paste the `USER_MANAGEMENT_KEY` from `.env.local` to create the first administrator. That option disappears once an account exists.

Everyday commands:

| Task | Command |
|---|---|
| Start, follow logs, stop | `docker compose up -d` · `docker compose logs -f app` · `docker compose down` (data stays in volumes) |
| Lint, typecheck, build | `docker compose exec app npm run lint` (likewise `typecheck`, `build`) |
| Browser end-to-end tests | `scripts/e2e.sh` (see [Checks and tests](#checks-and-tests)) |
| Sample data (needs an administrator) | `docker compose run --rm setup node scripts/seed-sample-data.mjs` |
| Schema upgrade after pulling code | `docker compose run --rm setup node scripts/create-database.mjs` |
| Add a dependency | `docker compose exec app npm install <package>`, then `docker compose build` |
| PostgreSQL from a desktop tool | `127.0.0.1:5433`, database `salestrackpro`, user `postgres`, password `salestrackpro` (unless overridden) |

Notes:

- Re-running the full `setup` service generates a new app password and bootstrap key in `.env.local`; the other settings in the file (SMTP, Google, timezone) are kept. Use the single-script form above for upgrades.
- Dependencies live in a Docker volume seeded from the image. The container reinstalls automatically whenever `package-lock.json` differs from what is installed.
- Optional overrides go in an ignored `.env` next to `compose.yaml`: `POSTGRES_PASSWORD`, `APP_PORT` (default 3000), `DB_PORT` (default 5433, loopback only). Next.js reads `.env` too, so keep application settings in `.env.local`.
- If `docker` is not on your PATH (Docker Desktop without the CLI link), call it by its full path under `/Applications/Docker.app/Contents/Resources/bin/`. `scripts/e2e.sh` finds it on its own.

## Running without Docker

- Node.js 20.9 or newer (`node --version`)
- PostgreSQL 14 or newer with a superuser (or database-owner) account for setup

```bash
npm install
cp .env.setup.local.example .env.setup.local   # PostgreSQL administrator credentials, kept out of Git
npm run db:create                               # creates or upgrades the schema and reference data
npm run db:user:create                          # restricted app account + .env.local with the bootstrap key
npm run dev
```

Then complete the first-time setup in the browser as above. `npm run db:seed` adds sample data (demo Sales Managers, a Recruiter, leads, activities, tasks) once an administrator exists. Re-running `npm run db:create` after pulling new code applies any migrations that have not run yet.

## Configuration (`.env.local`)

The setup step writes the database settings and a commented template for the rest:

| Setting | Purpose |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Runtime database role (read/write only, no DDL). Docker setup writes `PGHOST=db` |
| `USER_MANAGEMENT_KEY` | One-time key for creating the first administrator |
| `APP_URL` | Public URL. Required behind a reverse proxy, and used in password-reset links. An `http://` value also turns off the Secure flag on session cookies, for deployments without TLS |
| `TRUSTED_ORIGINS` | Extra allowed origins for state-changing requests, comma separated |
| `BUSINESS_TIMEZONE` | Business day for follow-ups, weekly targets, reports, and each account's daily auto sign-out time (default `America/Toronto`) |
| `ATTACHMENT_DIR` | Where uploaded documents and profiles are stored (default `./storage/attachments`) |
| `MAIL_PROVIDER` | `stub` records every email in the Settings outbox instead of sending (the default the setup writes); `smtp` sends through the settings below; `off` disables email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outbound email for password resets, set-password links, and two-factor codes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `GOOGLE_REDIRECT_URI` | Gmail linking for the lead Emails tab. The token key is any long random string that encrypts stored refresh tokens; the redirect URI defaults to `APP_URL/api/gmail/callback` |
| `TRIPS_PROVIDER` | `stub` serves sample companies for the sales trip planner (the Docker dev stack sets it); leave empty for live data |
| `MAPS_API_KEY` | Google Maps Platform key (Geocoding, Places, Distance Matrix) for live trip searches |
| `JOBS_API_URL`, `JOBS_API_KEY` | Licensed job-listing aggregator behind the JSON contract in SPEC §10.8; without it the Hiring column stays blank |

With `MAIL_PROVIDER=stub` the email features work without a mailbox: reset links and sign-in codes appear under Settings → Email delivery, where an administrator can open each message. Switch to `MAIL_PROVIDER=smtp` with the `SMTP_*` settings when a real mailbox is ready; without either, administrators set passwords directly and two-factor cannot be switched on.

### Gmail linking

Each user connects their own Google account from a lead's **Emails** tab (read-only Gmail scope). The tab then lists recent messages exchanged with the lead's client email addresses; administrators see messages from every connected mailbox. To enable it:

1. In Google Cloud Console, enable the Gmail API and create an OAuth client of type Web application with the redirect URI `<APP_URL>/api/gmail/callback` (for local development `http://localhost:3000/api/gmail/callback`).
2. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GMAIL_TOKEN_KEY` in `.env.local` and restart the app. The `gmail_connections` table is created by the schema script (migration 3).

Until these exist the Emails tab explains that Gmail is not configured, and emails are logged by hand on the Timeline.

The setup scripts read `.env.setup.local` (administrator credentials) instead; it also accepts `PGAPPUSER` (the name of the restricted application role, default `salestrackpro_app`) and `PGDATABASE` (default `salestrackpro`).

## Production

`compose.prod.yaml` overrides the development stack with a standalone Next.js image (about 460 MB), no bind mounts, uploads in the `attachments` volume, and PostgreSQL not published on the host.

```bash
echo "POSTGRES_PASSWORD=<strong password>" > .env
docker compose -f compose.yaml -f compose.prod.yaml run --rm setup       # first time only
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

- The app container takes its configuration from `.env.local`. Behind a reverse proxy, set `APP_URL` to the public origin and terminate TLS at the proxy.
- The image carries the database scripts, so later schema upgrades can run from it:

  ```bash
  docker compose -f compose.yaml -f compose.prod.yaml run --rm \
    -e PGUSER=postgres -e PGPASSWORD=<postgres password> app node scripts/create-database.mjs
  ```

- Database files live in the `postgres_data` volume and uploads in `attachments`; back up both.
- Without Docker: `npm run build` then `npm run start`, or run `node .next/standalone/server.js` after copying `public/` and `.next/static/` next to it, as the Next.js standalone output expects.

## Project layout

```
src/app/                 Next.js App Router: page.tsx (client shell) and api/** route handlers
src/features/<area>/     model.ts (types, validation) · repository.ts (SQL, rules) · client.ts (fetch) · React components
src/lib/                 database pool, dates and timezone, HTTP helpers, mailer, async-data hook
scripts/                 create-database.mjs (migrations), create-app-user.mjs, seed-sample-data.mjs,
                         docker-entrypoint.sh (dev container), e2e.sh (browser suite runner)
tests/e2e/               Selenium end-to-end suite (node:test) with helpers/ui.mjs and helpers/data.mjs
docs/                    PRD.md (requirements with IDs and status), SPEC.md (design, API, data model, screens),
                         Sales_Tracker_App_BRD_SRS_Updated.pdf (the updated BRD/SRS; its new section 25 is tracked as OPP-01..22 in PRD.md)
Dockerfile               targets: dev (hot reload) and runner (standalone production image)
compose.yaml             db, app, setup, and the `test` profile (db-test, app-test, selenium, e2e)
compose.prod.yaml        production override
```

## What is implemented

- **Roles and privileges.** Three system roles (Admin, Sales Manager, Recruiter) with renamable display names. Each role has default privileges; administrators can grant extras per account.
- **Sign-in and security.** Email and password with scrypt hashes, database-backed sign-in rate limiting and login history, optional email two-factor codes, per-account daily auto sign-out at a configurable time, change password, forgot-password links, and administrator password resets.
- **Leads.** All BRD section 6 fields plus the status reasons from the October 2026 change note (Lost Lead and Disqualified ask for a reason and display as “Status – Reason” everywhere), owner as a user reference, creator becomes owner, transfer and administrator reassignment (open tasks follow the lead), bulk archive, restore, and reassign, independent archive search, and queued leads for historical first-contact dates with approve and reject.
- **Timeline.** Logged calls, emails, visits, and interaction notes, plus automatic entries for status, BD action, client response, follow-up, transfer, state, task, and file events. Most recently active leads sort first.
- **Emails (Gmail).** Each user can link their Gmail account; a lead's Emails tab lists recent messages to or from the lead's client addresses with direction, sender, recipients, subject, time, and body text. Administrators see every connected mailbox. Dormant until a Google OAuth client is configured.
- **Search and filters.** Keyword search across lead fields and notes; filters for lead type, status and status reason, category, size, city, owner, client response, BD action, and date ranges; sortable, paginated lists.
- **Tasks.** Tasks with lead, assignee, due date and time, priority, description, and checklist. Due dates can be typed in words (“next Monday at 10am”, “in two weeks”, “Feb 1”, “January”) and are shown for confirmation before saving; month names and relative periods skip weekends and business-calendar holidays. Follow-ups scheduled from a lead set the follow-up date and create a reminder task, and a note that mentions a next step with a date (“follow up next week”, “send the proposal by Friday”) offers to create that task when the note is saved.
- **Sales trip planner.** Define a trip by title, address, radius in kilometres or driving minutes, business type, and number of results (up to 50); the companies found are listed with address, distance, a hiring count that opens the job listings, and an Action computed by matching each company against existing leads and clients (website domain, phone, name, address) and shown as the lead's status, including “Lost Lead – reason” and “Disqualified – reason”. Sort any column, filter by Action, shortlist, set planned visit dates, export to Excel, or print the field-visit report. Sample data by default; live providers plug in behind a small interface.
- **Files.** Documents and a separate Resumes/Profiles Shared area, with in-app preview for PDF, images, text, and Word files, version numbers for re-uploads, and administrator soft delete.
- **Action center.** Calls, emails, and visits this week versus last week, overdue, today, and tomorrow follow-ups, target progress, leads that have gone quiet for longer than their limit (a default number of days plus Admin rules per status and BD action), open tasks, and recent leads.
- **Targets and reports.** Target templates per productivity stage, assignment per person, and reports for today, yesterday (business day), this week, last week, month to date, last month, and year to date with drill-down to the underlying records and Excel, PDF, or CSV export. Team reports filter by person, productivity stage, and target template. Tool-engagement counts (logins, updates, tasks, files) are included.
- **Administration.** User management with terminate-and-reassign, list-of-values management with rename that flows through to existing leads, target templates, and settings (role names, reminder days, and the business calendar of public holidays).
- **Audit.** Every create, update, transfer, approval, archive, file, task, user, value, and settings change is recorded with actor, time, and before/after values. Lead history is shown on the lead for administrators.

## Not yet connected

Google sign-in, stored email threads with reply and forward, AI summaries, voice-to-text, OCR of business cards, collaboration threads and mentions, push and email notifications, device authorization, rich-text notes, the Opportunity Recommendation module from the updated BRD (scheduled job-listing searches), and live map, company, review, routing, or job-board data (the sales trip planner uses sample companies until keys are set). Lead generation and the road visit planner show sample content. Designs for these are in SPEC.md section 10.

## Checks and tests

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit     # date parser, status helpers, trip matching, reminder rules (node:test, no database needed)
```

Inside Docker, prefix each with `docker compose exec app`.

### Browser end-to-end tests (Selenium)

`scripts/e2e.sh` runs the suite in `tests/e2e/` entirely in Docker (compose profile `test`): a production build of the app with a fresh schema, a throwaway PostgreSQL kept in memory, a Selenium Chromium grid, and the test runner. Nothing is needed on the host besides Docker. A full run takes about two minutes including container start.

```bash
scripts/e2e.sh                               # whole suite
scripts/e2e.sh tests/e2e/02-leads.test.mjs   # one or more files
```

| File | Covers |
|---|---|
| `01-auth.test.mjs` | Sign-in screen, first administrator via the setup link, sign out, wrong password, password reset request accepted in stub mail mode, password change and re-login |
| `02-leads.test.mjs` | Create a lead, BD action, call and note on the timeline, a note that offers and creates a follow-up task, Emails tab without Gmail configured, follow-up that becomes a task, document upload, edit, status change, Disqualified with a reason, list and global search, archive and restore |
| `03-tasks.test.mjs` | Create a task linked to a lead, complete it, edit it, type a due date in words and confirm the resolved date |
| `04-team.test.mjs` | Create a Sales Manager, a per-account sign-out time ends a session started before it, role-limited navigation, historical date queues a lead, admin approval, transfer, termination hand-off, terminated account cannot sign in |
| `05-admin-reports.test.mjs` | List of values, role rename reflected in the sidebar, a needs-attention rule that shows on the Action Center, a set-password link read from the stub outbox and used to reset the password, business-calendar holiday, target template, report drill-down, stage filter, PDF and Excel export responses, action-center metric link |
| `06-trips.test.mjs` | Plan a sales trip on the stub provider, a lead recognised by website domain, job listings dialog, shortlist and planned visit, Show and Action filters, Excel export response, trip list |
| `07-accessibility.test.mjs` | axe-core WCAG 2.1 A/AA audit of the sign-in screen, Action Center, lead dialog, lead list, tasks, reports, settings, list of values, user management, and trip planner; serious or critical findings fail |

- Tests are written with `node:test` and `selenium-webdriver`; the page helpers (labels, dialogs, toasts, navigation) live in `tests/e2e/helpers/ui.mjs`, test data and the bootstrap shortcut in `tests/e2e/helpers/data.mjs`.
- Watch the browser at [http://localhost:7900](http://localhost:7900) while a run is in progress.
- A failed test leaves a screenshot and the page DOM in `tests/e2e/output/` (ignored by Git).
- The test app runs on plain HTTP inside the compose network, so it starts with `APP_URL=http://app-test:3000` (see the configuration table). Inside the dev container, `npm run test:e2e` runs the same files against the `test` profile hosts.

## Troubleshooting

- **"Could not load the workspace" right after signing in** on an `http://` host other than localhost: the browser dropped the Secure session cookie. Set `APP_URL` to that `http://` origin, or serve the app over HTTPS.
- **"Password reset emails are not configured yet"** or two-factor cannot be enabled: fill in the `SMTP_*` settings and restart the app.
- **"Request origin rejected"** behind a proxy: set `APP_URL` (or `TRUSTED_ORIGINS`) to the public origin, and make sure the proxy forwards `X-Forwarded-Host` and `X-Forwarded-Proto`.
- **Port already in use**: set `APP_PORT` or `DB_PORT` in `.env` and run `docker compose up -d` again.
- **Stale dependencies after switching branches**: restart the app container; it reinstalls when the lockfile changed. Run `docker compose build` to refresh the image as well.
