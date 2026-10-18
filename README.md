# SalesTrackPro

SalesTrackPro is a Next.js sales workspace built from the Sales Tracker BRD/SRS in `docs/`. Leads, interactions, tasks, documents, candidate profiles, targets, reports, users, and the full audit trail live in MySQL. Lead generation and the road visit planner are labelled previews until external data sources are connected.

## Requirements

- Node.js 20.9 or newer (`node --version`)
- MySQL 5.7 or 8.x with an administrator account for setup

## First run

```bash
npm install
cp .env.setup.local.example .env.setup.local   # MySQL administrator credentials, kept out of Git
npm run db:create                               # creates or upgrades the schema and reference data
npm run db:user:create                          # restricted app account + .env.local with the bootstrap key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose **First time setup**, and paste the `USER_MANAGEMENT_KEY` from `.env.local` to create the first administrator. That option disappears once an account exists.

Optional sample data (demo Sales Managers, a Recruiter, leads, activities, tasks):

```bash
npm run db:seed
```

Re-running `npm run db:create` after pulling new code applies any schema migrations that have not run yet. A database created by the earlier prototype is upgraded in place; its old free-text leads table is kept as `legacy_leads`.

## Configuration (`.env.local`)

`npm run db:user:create` writes the database settings and a commented template for the rest:

| Setting | Purpose |
|---|---|
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` | Runtime database account (read/write only, no DDL) |
| `USER_MANAGEMENT_KEY` | One-time key for creating the first administrator |
| `APP_URL` | Public URL. Required behind a reverse proxy, and used in password-reset links |
| `TRUSTED_ORIGINS` | Extra allowed origins for state-changing requests, comma separated |
| `BUSINESS_TIMEZONE` | Business day for follow-ups, weekly targets, reports, and the 11 PM auto sign-out (default `America/Toronto`) |
| `ATTACHMENT_DIR` | Where uploaded documents and profiles are stored (default `./storage/attachments`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outbound email for password resets, set-password links, and two-factor codes |

Email features stay dormant until the `SMTP_*` settings are filled in. Until then administrators set passwords directly from User management and two-factor cannot be switched on.

## What is implemented

- **Roles and privileges.** Three system roles (Admin, Sales Manager, Recruiter) with renamable display names. Each role has default privileges; administrators can grant extras per account.
- **Sign-in and security.** Email and password with scrypt hashes, database-backed sign-in rate limiting and login history, optional email two-factor codes, per-account 11 PM auto sign-out, change password, forgot-password links, and administrator password resets.
- **Leads.** All BRD section 6 fields, owner as a user reference, creator becomes owner, transfer and administrator reassignment (open tasks follow the lead), bulk archive, restore, and reassign, independent archive search, and queued leads for historical first-contact dates with approve and reject.
- **Timeline.** Logged calls, emails, visits, and interaction notes, plus automatic entries for status, BD action, client response, follow-up, transfer, state, task, and file events. Most recently active leads sort first.
- **Search and filters.** Keyword search across lead fields and notes; filters for lead type, status, category, size, city, owner, client response, BD action, and date ranges; sortable, paginated lists.
- **Tasks.** Tasks with lead, assignee, due date and time, priority, description, and checklist. Follow-ups scheduled from a lead set the follow-up date and create a reminder task.
- **Files.** Documents and a separate Resumes/Profiles Shared area, with in-app preview for PDF, images, text, and Word files, version numbers for re-uploads, and administrator soft delete.
- **Action center.** Calls, emails, and visits this week versus last week, overdue, today, and tomorrow follow-ups, target progress, leads with no activity, open tasks, and recent leads.
- **Targets and reports.** Target templates per productivity stage, assignment per person, and reports for today, yesterday (business day), this week, last week, month to date, last month, and year to date with drill-down to the underlying records and CSV export. Tool-engagement counts (logins, updates, tasks, files) are included.
- **Administration.** User management with terminate-and-reassign, list-of-values management with rename that flows through to existing leads, target templates, and settings.
- **Audit.** Every create, update, transfer, approval, archive, file, task, user, value, and settings change is recorded with actor, time, and before/after values. Lead history is shown on the lead for administrators.

## Not yet connected

Google sign-in, Gmail linking and AI summaries, voice-to-text, OCR of business cards, collaboration threads and mentions, push and email notifications, device authorization, rich-text notes, and live job-board, review, or routing data. Lead generation and the road visit planner show sample content.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
