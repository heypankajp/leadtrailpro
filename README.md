# LeadTrailPro

LeadTrailPro (renamed from SalesTrackPro on October 30, 2026) is a sales workspace for a staffing and recruitment business, built from the Sales Tracker BRD/SRS. Leads, interactions, tasks, documents, candidate profiles, targets, reports, users, and the full audit trail live in PostgreSQL behind a Next.js application. Phase 1 (the core workspace), notifications, and collaboration threads are implemented; the external integrations are planned. The requirements with their status are in [docs/PRD.md](docs/PRD.md) and the technical design in [docs/SPEC.md](docs/SPEC.md).

## At a glance

| | |
|---|---|
| Stack | Next.js 16.4.3 (App Router, Turbopack; the October 30, 2026 security release), React 19, TypeScript 5, PostgreSQL 17 (14 or newer works), hand-written CSS |
| Packaging | Docker: hot-reloading development stack, standalone production image, one-shot setup service |
| Tests | ESLint, `tsc`, production build, unit suites for the date parser, status helpers, trip matching, reminder rules, digests, rich text, mentions, the tracker import rules, and the job-listing sources, and a 54-test Selenium browser suite with an axe-core accessibility audit, all in Docker; GitHub Actions runs all of it on every push and pull request |
| Notifications | Bell in the top bar for task, lead, queue, file, and client-email events; daily and weekly digests by email and in-app, scheduled by the `jobs` service |
| Email | Sent through the Google app from the mailbox an administrator chooses under Settings → Email delivery (`MAIL_PROVIDER=gmail`, the default once the Google client is set). `MAIL_PROVIDER=stub` records messages under Settings → Email log instead of sending (test stacks). No SMTP account is needed |
| Sales trip planner | Built from the October 2026 change note; runs on sample company data until `MAPS_API_KEY` is set. Google calls are metered in the app: the planner pages show everyone a live usage card (per allowance, what is left, reset date), searches stop at the monthly budgets under Settings → Google Maps usage, and administrators are notified at 80% and 100%. Hiring counts come from a job-sources layer that combines Adzuna, JSearch, and Indeed via HasData behind a cache with per-source budgets (keys optional, set under Settings) |
| Preview pages | Lead generation and the road visit planner show sample content until data sources are connected |

## Quick start with Docker

Requires Docker Desktop, or Docker Engine with the Compose plugin. Nothing else is installed on the machine: Node 22 and PostgreSQL run in containers, and the project directory is mounted into the app container so edits hot-reload as usual.

Before the setup step, open `seed/accounts.csv` and make sure the people who may sign in are listed, the administrator first (format and rules under [Seed accounts](#seed-accounts)). Then:

```bash
git clone https://github.com/heypankajp/leadtrailpro.git
cd leadtrailpro
#  edit seed/accounts.csv if the people on it are not the right ones
docker compose run --rm setup   # once: builds the dev image (a few minutes the first time), creates the schema, the app user, .env.local, and the accounts from seed/accounts.csv
docker compose up -d            # dev server at http://localhost:3000; `docker compose ps` shows db healthy, app and jobs up
```

Open [http://localhost:3000](http://localhost:3000) and sign in with **Sign in with Google** as one of the accounts in `seed/accounts.csv`. (With an empty accounts file the screen offers **First time setup** instead, which creates the first administrator with the `USER_MANAGEMENT_KEY` from `.env.local`.) The administrator signs in with **Sign in with Google** (see [Sign in with Google](#sign-in-with-google)); the password column of the seed file matters only on a stack without a Google client.

Step-by-step instructions for a laptop (with or without Docker) and for a server, including what to click and how to read a failed database connection, are in [docs/TESTING.md](docs/TESTING.md).

Everyday commands:

| Task | Command |
|---|---|
| Start, follow logs, stop | `docker compose up -d` · `docker compose logs -f app` · `docker compose down` (data stays in volumes) |
| Lint, typecheck, build | `docker compose exec app npm run lint` (likewise `typecheck`, `build`) |
| Browser end-to-end tests | `scripts/e2e.sh` (see [Checks and tests](#checks-and-tests)) |
| Sample data (needs an administrator) | `docker compose run --rm setup node scripts/seed-sample-data.mjs` |
| Seed accounts again after editing `seed/accounts.csv` | `docker compose run --rm setup node scripts/seed-users.mjs` (adds new emails only) |
| Import the legacy tracker (needs an administrator; `--dry-run` first) | `docker compose run --rm setup node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" --dry-run` |
| Schema upgrade after pulling code | `docker compose run --rm setup node scripts/create-database.mjs` |
| Check the database connection the app will use | `docker compose run --rm app npm run db:check` |
| Check the Google Maps key (three live calls) | `docker compose run --rm app npm run maps:test -- "1 Dundas St W, Toronto"` |
| Add a dependency | `docker compose exec app npm install <package>`, then `docker compose build` |
| PostgreSQL from a desktop tool | `127.0.0.1:5433`, database `leadtrailpro`, user `postgres`, password `leadtrailpro` (unless overridden) |

Notes:

- Re-running the full `setup` service generates a new app password and bootstrap key in `.env.local`; the other settings in the file (SMTP, Google, timezone) are kept. Use the single-script form above for upgrades.
- Dependencies live in a Docker volume seeded from the image. The container reinstalls automatically whenever `package-lock.json` differs from what is installed.
- Optional overrides go in an ignored `.env` next to `compose.yaml`: `POSTGRES_PASSWORD`, `APP_PORT` (default 3000), `DB_PORT` (default 5433, loopback only). Next.js reads `.env` too, so keep application settings in `.env.local`.
- If `docker` is not on your PATH (Docker Desktop without the CLI link), call it by its full path under `/Applications/Docker.app/Contents/Resources/bin/`. `scripts/e2e.sh` finds it on its own.

## Running without Docker

- Node.js 22, at least 22.9 (`node --version`; the check scripts use `--env-file-if-exists`)
- PostgreSQL 14 or newer with a superuser (or database-owner) account for setup

```bash
git clone https://github.com/heypankajp/leadtrailpro.git && cd leadtrailpro
npm ci
cp .env.setup.local.example .env.setup.local   # PostgreSQL administrator credentials, kept out of Git
npm run db:create                               # creates or upgrades the schema and reference data
npm run db:user:create                          # restricted app account + .env.local with the bootstrap key
npm run db:seed:users                           # the accounts in seed/accounts.csv (edit the file first)
npm run db:check                                # confirms the app can reach the database with .env.local
npm run dev
```

Then complete the first-time setup in the browser as above. `npm run db:seed` adds sample data (demo Sales Managers, a Recruiter, leads, activities, tasks) once an administrator exists. `npm run db:import -- "docs/Sales Leads 2026.xlsx" --dry-run` reads the client's legacy tracker and reports what it would create; without `--dry-run` it imports one lead per company with a timeline entry per row (rules and options in SPEC.md §10.9; the report lands in `import-report.txt`). Re-running `npm run db:create` after pulling new code applies any migrations that have not run yet.

## Configuration (`.env.local`)

The setup step writes the database settings and a commented template for the rest:

| Setting | Purpose |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Runtime database role (read/write only, no DDL). Docker setup writes `PGHOST=db` |
| `USER_MANAGEMENT_KEY` | One-time key for creating the first administrator |
| `APP_URL` | Public URL. Required behind a reverse proxy, and used in password-reset links. An `http://` value also turns off the Secure flag on session cookies, for deployments without TLS |
| `TRUSTED_ORIGINS` | Extra allowed origins for state-changing requests, comma separated |
| `ALLOWED_DEV_ORIGINS` | Only for `next dev` on a public host: extra hostnames the development server may serve to, comma separated. `leadtrail.pro` and `www.leadtrail.pro` are built in (`next.config.ts`); the production image does not need this |
| `BUSINESS_TIMEZONE` | Business day for follow-ups, weekly targets, reports, and each account's daily auto sign-out time (default `America/Toronto`) |
| `ATTACHMENT_DIR` | Where uploaded documents and profiles are stored (default `./storage/attachments`) |
| `JOBS_KEY` | Shared secret between the app and the scheduler that runs the summary emails, the opportunity searches, and the weekly report (`npm run jobs` or the `jobs` compose service); Docker passes it from `.env`. Required in production |
| `MAIL_PROVIDER` | `gmail` sends through the Google app from the mailbox chosen under Settings → Email delivery (the default when the Google client is set); `stub` records every email under Settings → Email log instead of sending; `smtp` (legacy) sends through the settings below; `off` disables email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Legacy SMTP mailer, used only with `MAIL_PROVIDER=smtp`; not needed with the Google app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `GOOGLE_REDIRECT_URI` | One OAuth client for **Sign in with Google** and the Gmail link on the lead Emails tab. The token key is any long random string that encrypts stored refresh tokens; the redirect URI defaults to `APP_URL/api/auth/google/callback` and is the only one to register |
| `GOOGLE_AUTH_URI`, `GOOGLE_TOKEN_URI`, `GOOGLE_PROJECT_ID` | Optional, from the same OAuth client JSON (`auth_uri`, `token_uri`, `project_id`); the endpoints default to Google's standard ones and the project id is informational |
| `TRIPS_PROVIDER` | `stub` serves sample companies for the sales trip planner (the end-to-end stack sets it; for the Docker dev stack put it in `.env`), and their Hiring counts then come from the sample job source so no live job-source budget is spent on fictional names; leave empty for live data, which is the default when a Maps key is present |
| `MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) | Google Maps Platform key for live trip searches. Enable the **Geocoding API**, **Places API (New)**, and **Routes API** on the Cloud project (the legacy Places and Distance Matrix services are not used; Distance Matrix cannot be enabled on projects created after October 2026). `npm run maps:test -- "<address>"` checks a key with three calls. The app counts every call per month under **Settings → Google Maps usage** and stops at budgets that default to 90% of Google's free allowance per SKU (Geocoding 10,000, Places text search 1,000, Route matrix 10,000 a month, reset monthly); administrators are notified at 80% and at 100%. For a hard guarantee also cap each API's requests per day under APIs & Services → Quotas in the Cloud console and set a Cloud Billing budget alert |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adzuna job search (free developer key) for the Hiring column |
| `JSEARCH_API_KEY` | JSearch on RapidAPI (Google for Jobs) for the Hiring column |
| `HASDATA_API_KEY`, `HASDATA_INDEED_DOMAIN` | HasData Indeed Jobs Scraper API for the Hiring column and the opportunity searches; the domain selects a regional Indeed site (`ca` → `ca.indeed.com`). Ten credits a call, about fifteen listings a call |
| `JOBS_API_URL`, `JOBS_API_KEY` | A custom job-listing source behind the JSON contract in SPEC §7.13 |
| `JOBS_COUNTRY` | Country code for the sources that take one (default `ca`) |

Email goes out through the Google app: an administrator picks the sending mailbox under Settings → Email delivery from the people who have signed in with Google, and notifications and summary emails are sent from it. Report emails (the weekly stalled-leads report to administrators) stay off until the switch next to it is on. With `MAIL_PROVIDER=stub` nothing is sent and every message is recorded under Settings → Email log, which the test stacks use. The consent screen was published on November 6, 2026, so tokens no longer expire after seven days; a token issued while the screen was still in Testing is renewed by that person signing in once more, the sending mailbox first.

Job-source keys can be tried without a trip: `npm run jobs:test -- "OceanMD" Toronto` (in Docker: `docker compose run --rm app npm run jobs:test -- "OceanMD" Toronto`) calls every configured source for that company and prints what each returns. It spends one call per source, so use it sparingly on a test plan. With `TRIPS_PROVIDER=stub` the trip planner itself never calls the live sources, because its companies are fictional.

### Job-source keys for testers

The keys live only in `.env.local`, which Git ignores; never put them in `.env.setup.local.example` or any other committed file. Two ways to give testers access:

- **Share your keys privately** (password manager, a disappearing message; not email or chat history): the four lines `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `HASDATA_API_KEY`, `HASDATA_INDEED_DOMAIN`. The tester pastes them into their `.env.local`, restarts the app (`docker compose restart app`), and checks Settings → Job sources or runs `npm run jobs:test`. Everyone then shares one quota, and Adzuna's test plan allows only 25 calls a day until the application is activated.
- **Each tester creates free keys** (a few minutes each, no card):
  1. Adzuna: developer.adzuna.com → register → create an application → copy the Application ID and Key. New applications start as "pending activation" with 25 calls a day until Adzuna reviews them; set the source's budget under Settings → Job sources to 20 a day and 25 a month meanwhile.
  2. HasData: hasdata.com → sign up → account settings → copy the API key. The free plan is 1,000 credits a month; an Indeed lookup costs 10. Set `HASDATA_INDEED_DOMAIN=ca` (the app expands it to `ca.indeed.com`).
  3. JSearch (optional): rapidapi.com → the JSearch listing → subscribe to the free Basic plan → copy the `X-RapidAPI-Key` into `JSEARCH_API_KEY`.

With `TRIPS_PROVIDER=stub` the trip planner never calls these sources (its companies are fictional); `npm run jobs:test -- "<company>" <city>` is the way to see them answer for a real company.

### Google Maps key and the usage budget

The Sales Trip Planner searches with Google Maps Platform: the Geocoding API for the trip address, Places API (New) for the companies (with website and phone), and the Routes API for driving minutes. One key serves all three, and the app calls Google only from the server, never from the browser.

1. **Create the key**: console.cloud.google.com → the project → APIs & Services → Library: enable **Geocoding API**, **Places API (New)**, and **Routes API** (billing must be enabled on the project; the free allowance still applies). Then Credentials → Create credentials → API key, and under the key's **API restrictions** allow only those three APIs.
2. **Configure**: put `MAPS_API_KEY=<key>` (or `GOOGLE_MAPS_API_KEY=<key>`) in `.env.local` and restart the app (`docker compose restart app`). With Docker, leave `TRIPS_PROVIDER` out of `.env` or empty: `stub` there keeps the sample companies and never uses the key.
3. **Check**: `npm run maps:test -- "1 Dundas St W, Toronto"` (in Docker: `docker compose run --rm app npm run maps:test -- "1 Dundas St W, Toronto"`) makes three live calls, not counted by the meter, and names any API that is not enabled.
4. **Upgrade the schema** after pulling a release with the meter: `docker compose run --rm setup node scripts/create-database.mjs` (migration 13 adds the `maps_usage` counters and the default budgets).

**What is counted and where to see it.** Google's free allowance is per API and per month (Geocoding 10,000 calls, Places text search 1,000 calls, Route matrix 10,000 elements); it resets monthly and is not pooled. A search spends one geocode for a new address (re-runs reuse the stored coordinates), one Places call per page of up to 20 companies (the scarcest allowance: 1,000 pages a month is at least 300 searches), and, only for a radius in driving minutes, one route element per company found. The app counts every call per calendar month and stops at the budgets under **Settings → Google Maps usage** (defaults 9,000 / 900 / 9,000, 90% of the allowance, editable). Everyone who plans trips sees the live card on the planner pages (used, left, reset date); administrators are notified in the app, and by email if they opted in to event emails, at 80% and when a budget is spent. A refused search says which allowance is spent; the choices are to wait for the 1st, raise the budget (usage past the free cap is billed by Google), or search with a radius in km. Keep **Number of results** at 20 or fewer so a search takes one page.

**Google-side guard rails (recommended).** The app's meter is the first line; a cap in Google Cloud is the one nothing can bypass. Under APIs & Services → Quotas & System Limits set a cap on each of the three APIs where one is offered (per day or per minute; about a thirtieth of the monthly budget per day, for example Geocoding 300, Places text search 30, route matrix elements 300), and under Billing → Budgets & alerts create a budget of a few dollars with email alerts. Google's quotas apply to the whole project, so they also cover any other use of the key.

### Gmail linking

Read-only access to each user's own mailbox is granted together with their first **Sign in with Google** sign-in (next section), and the app stores the token so nobody is asked again. A lead's **Emails** tab then lists recent messages exchanged with the lead's client email addresses; administrators see messages from every connected mailbox, and a colleague helping on a lead sees the client thread from whichever connected mailbox the mailbox watch (below) matched to that lead, even without a mailbox of their own. The tab keeps a **Connect Gmail** button for people who unticked the Gmail box on Google's consent screen or whose token expired (see the note on the consent screen below). From the same tab, **Send email** writes to the lead's contacts from the person's own mailbox, with the lead's documents as attachments, and **Reply** answers inside the thread; sent mail shows in the trail with the replies and is logged on the timeline. To enable it:

1. In Google Cloud Console, enable the Gmail API on the project of the OAuth client.
2. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GMAIL_TOKEN_KEY` in `.env.local` and restart the app. The `gmail_connections` table is created by the schema script (migration 3).

Until these exist the Emails tab explains that Gmail is not configured, and emails are logged by hand on the Timeline.

**Client replies (mailbox watch).** Every five minutes the scheduler (the `jobs` service, see Scheduling below) scans each connected mailbox for mail newer than its last scan, keeps the messages exchanged with a lead's client email addresses, and stores them per lead (`lead_emails`). When the sender is one of the lead's client addresses the lead is stamped with the client's last email time: the lead list shows "Client wrote 2 hours ago" under the client name, the lead page shows it next to the follow-up date, and the list can be sorted by it. A client email newer than the team's last email and last timeline action on that lead is **awaiting reply**: those leads appear in the Action Center panel "Client replies waiting" and in the daily digest, and the lead owner gets a bell notification (type `email_received`, emailed too for people who opted in to event emails) the moment the scan finds it. Received emails also appear on the lead's Timeline as `email` entries that do not count as sales activity. The first scan of a mailbox looks back 30 days silently (timestamps and timeline, no notifications); later scans only notify. Only message headers and the Gmail snippet are read, and only messages that match a lead are stored. Administrators switch the watch off under Settings → Email delivery.

### Sign in with Google

When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, the sign-in screen offers only **Sign in with Google**: there is no email and password form, `POST /api/auth/login` answers 403, the Change password entry disappears from the user menu, and User management has no password fields, set-password emails, or two-factor switch: a person is added with their Google address and signs in with it. Password sign-in exists only on a stack without a Google client (the browser test suite, or a laptop before the client is configured). Google is asked for the person's identity (`openid email profile`) and read-only Gmail in one consent, so the mailbox link exists from the first sign-in; the token is stored, and later sign-ins only show Google's account picker. Someone who unticks the Gmail box still signs in and gets a note to connect it later from a lead's Emails tab. The account whose email equals the verified Google email is signed in. Nobody is created on the way in: an email that is not in the users table, or belongs to a deactivated account, sees "Sign-in failed: these credentials are not valid or you are not registered. Please contact your administrator." A Google sign-in skips the email two-factor step, since Google has already verified the person, and is recorded in the login history like any other sign-in.

1. On the OAuth client, add `<APP_URL>/api/auth/google/callback` (locally `http://localhost:3000/api/auth/google/callback`) as the Authorized redirect URI. Sign-in and the Gmail link share it.
2. On the consent screen choose the External user type, so personal Gmail accounts can sign in as well as Google Workspace ones, and add the Gmail read-only scope. Google calls that scope restricted. While the screen is in Testing only the listed test users (up to 100) can sign in and refresh tokens expire after seven days, after which the Emails tab asks to reconnect; publishing the screen (Audience → Publish app) lifts both, and the LeadTrailPro screen has been published since November 6, 2026. Who may sign in is decided by the app alone (the users table). The app stays unverified: each person's first consent shows "Google hasn't verified this app", which they pass with Advanced → Go to LeadTrailPro, and at most 100 people over the project's lifetime can accept that screen. Google's verification for the restricted scope needs a paid yearly security assessment and is not planned.
3. Make sure each person exists with their Google email, either in the seed file below or under **Admin → Users**.

### Seed accounts

`seed/accounts.csv`, in the repository, lists the accounts that may sign in: the administrator, one account per role, and any testers. Edit it and commit; the Docker `setup` service loads it on a new machine, and `docker compose run --rm setup node scripts/seed-users.mjs` (without Docker: `npm run db:seed:users`) loads it again after edits. The format is in the file's header:

```csv
email,first_name,last_name,role,stage
admin@example.com,Ada,Admin,admin,full_productive
sales@example.com,Sam,Seller,sales_manager,full_productive
```

Roles are `admin`, `sales_manager`, and `recruiter`; the stage column (`onboarding`, `training`, `full_productive`; default `full_productive`) is optional. No password is stored: everyone signs in with Google using that address. Every row is checked before anything is written, existing emails are never changed, and from then on administrators manage everyone under **Admin → Users**. The file holds real addresses, so keep the repository private.

#### Scheduling the Indeed run (for example every Monday morning)

Nothing is installed on the server for this: the `jobs` container (part of `docker compose up -d`, also in production) asks the app once a minute whether a search is due, and the app runs it once on the chosen days after the chosen time.

1. `.env.local` on the server: `HASDATA_API_KEY`, `HASDATA_INDEED_DOMAIN=ca`, and `BUSINESS_TIMEZONE` set to the client's zone (`America/Toronto`), so the time below is their local time. `.env` must have `JOBS_KEY`, which the production steps create.
2. Check that the `jobs` container is up: `docker compose -f compose.yaml -f compose.prod.yaml ps`.
3. As an administrator: Settings → Opportunity searches, tick Monday only, set the time (06:00), keep Indeed as the source, set the listings cap, save. Under Job sources, Indeed must be enabled with a budget.
4. Opportunities → Searches & runs: add the searches (a group of job titles, one location, and how many days back to look; new searches are pre-filled from Settings → Opportunity searches) and keep them active. Click **Run searches now** once to confirm the key and budget; the result and any HasData error show under Recent runs.

Every run also appears in the container log, `docker compose -f compose.yaml -f compose.prod.yaml logs --since 24h jobs`. If you would rather use the operating system's scheduler (Windows Task Scheduler, cron), stop the `jobs` container and post to the app instead, as often as once a minute or once an hour; the app still runs each search only once per day:

```
curl -X POST -H "X-Jobs-Key: <JOBS_KEY from .env>" -H "Content-Type: application/json" -d "{}" http://localhost:3000/api/jobs/run
```

### Analytics

**Analytics** opens, for administrators, with the **Team board**: one row per salesperson as things stand now (active leads, overdue follow-ups, stalled leads, client replies waiting, this week's calls, emails and visits, leads created, last active), the people with the most waiting on them first; every number opens the leads behind it, from where a manager can comment on the lead's Collaboration tab, assign a task, or reassign it. Below it, **Analytics** (the former Reports & dashboard) keeps the performance table with its drill-downs and exports and adds, for the chosen period and filters: the pipeline by status now (click a number or bar for the leads), the pipeline at the end of each day, week, or month of the period, the movement between statuses with the cold → warm → hot → client funnel and the moves backwards, lost and disqualified reasons, the median time a lead spends in each status, a stalled-leads list that says why each lead needs attention (longer in its status or quiet for longer than the needs-attention rules allow, follow-up overdue, a hot lead gone quiet), the opportunity pool funnel per run and by job type, breakdowns by industry, city, and lead type, the clients worked most, and a leaderboard per salesperson. Periods: last 24 hours, 7, 30, or 90 days, 12 months, the calendar periods, or a custom range. Filters: salesperson, status, lead type, city, industry, client name, lead source (pool or by hand), and job type. The needs-attention rules under Settings double as the days allowed per status. Sales Managers see their own numbers; administrators see everyone. A weekly stalled-leads email to administrators exists behind the Send report emails switch, off by default.

### Opportunity pool

**Opportunities** in the navigation is a shared list of companies that are hiring, built from keyword searches on the configured job-listing sources (Adzuna, JSearch, Indeed through HasData, a custom JSON source, or the sample source). Administrators keep the searches under **Opportunities → Searches & runs** (name, a group of up to ten job titles, one location, the posted-within window in days, job type, an optional cap of listings per source) and the schedule under **Settings → Opportunity searches** (days of the week, time, the default cap, the default titles, location, and window pre-filled on new searches, notifications); Indeed accepts one keyword per call, so a search's titles go out as one query (`"forklift operator" OR "machine operator"`), and one search covers the whole group at the cost of one call per page; the `jobs` service runs them, and **Run searches now** starts a run on demand. The sources that answer the searches are chosen under Settings → Opportunity searches (Indeed through HasData by default) and must also be enabled, with budget left, under Job sources, so two or three runs a week with a cap of a few hundred listings keep the Indeed calls inside the free credits.

Each run groups the listings by company into one card. From a card, a salesperson clicks **Assign as lead**, picks the owner (themselves by default), and saves the pre-filled lead form; the lead is created in that owner's name, linked to the card, and the card leaves the pool. **Not relevant** hides a card with a reason from the List of values; a role-level reason ("Role not relevant") lets the company come back when a different role appears, a company-level reason keeps it hidden. A company that is already a live lead or client never enters the pool: its new listings go to that lead's timeline (marked as system entries that do not count as sales activity) and the owner is notified. A company whose earlier lead was closed or archived comes back with that history, and **Reopen lead** restores the old lead for the chosen owner instead of creating a second one. Salespeople get a notification when a run adds new companies, and the Opportunities item shows how many wait in the pool.


## Production

`compose.prod.yaml` overrides the development stack with a standalone Next.js image (about 460 MB), no bind mounts, uploads in the `attachments` volume, and PostgreSQL not published on the host.

```bash
printf 'POSTGRES_PASSWORD=%s\nJOBS_KEY=%s\n' "$(openssl rand -base64 36)" "$(openssl rand -base64 36)" > .env   # both are required
docker compose -f compose.yaml -f compose.prod.yaml run --rm setup       # first time only; schema, app role, .env.local, and the accounts in seed/accounts.csv
#   now edit .env.local: APP_URL=https://sales.example.com and the GOOGLE_* lines (MAIL_PROVIDER=gmail), or MAIL_PROVIDER=stub
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run db:check
```

The full server walk-through, including the reverse proxy and the first sign-in, is [docs/TESTING.md, path C](docs/TESTING.md#c-server).

- The app container takes its configuration from `.env.local`. Behind a reverse proxy, set `APP_URL` to the public origin and terminate TLS at the proxy.
- Accounts: the setup step above creates every account in `seed/accounts.csv` that is missing. To add people later, add rows, commit, `git pull` on the server, and run `docker compose -f compose.yaml -f compose.prod.yaml run --rm setup node scripts/seed-users.mjs`; or add them under User management in the app. Nothing is needed in the Google Cloud console: the consent screen is published, so any Google address the app knows can sign in.
- The image carries the database scripts, so later schema upgrades can run from it (run this after pulling any release that adds a migration, for example migration 14 of November 7, 2026, which adds the mailbox-watch table and columns, or migration 13 of November 6, 2026, which adds the Google Maps usage counters):

  ```bash
  docker compose -f compose.yaml -f compose.prod.yaml run --rm \
    -e PGUSER=postgres -e PGPASSWORD=<postgres password> app node scripts/create-database.mjs
  ```

- Sample companies for the Sales Trip Planner on a server: put `TRIPS_PROVIDER=stub` in `.env` (compose passes it to the container; a value in `.env.local` is overridden there).
- Database files live in the `postgres_data` volume and uploads in `attachments`; back up both.
- Without Docker: `npm run build` then `npm run start`, or run `node .next/standalone/server.js` after copying `public/` and `.next/static/` next to it, as the Next.js standalone output expects.

## Project layout

```
src/app/                 Next.js App Router: page.tsx (client shell) and api/** route handlers
src/features/<area>/     model.ts (types, validation) · repository.ts (SQL, rules) · client.ts (fetch) · React components
src/lib/                 database pool, dates and timezone, HTTP helpers, mailer, async-data hook
scripts/                 create-database.mjs (migrations), create-app-user.mjs, seed-sample-data.mjs, import-tracker.mjs (+ lib/tracker-mapping.mjs),
                         db-check.mjs (connection diagnosis), mail-test.mjs (SMTP check), docker-entrypoint.sh (dev container), e2e.sh (browser suite runner)
tests/e2e/               Selenium end-to-end suite (node:test) with helpers/ui.mjs and helpers/data.mjs
docs/                    PRD.md (requirements with IDs and status), SPEC.md (design, API, data model, screens), TESTING.md (set up and test on a laptop or a server),
                         Sales_Tracker_App_BRD_SRS_Updated.pdf (the updated BRD/SRS; its new section 25 is tracked as OPP-01..22 in PRD.md)
Dockerfile               targets: dev (hot reload) and runner (standalone production image)
compose.yaml             db, app, jobs (digest and opportunity-search scheduler), setup, and the `test` profile (db-test, app-test, selenium, e2e)
compose.prod.yaml        production override
```

## What is implemented

- **Roles and privileges.** Three system roles (Admin, Sales Manager, Recruiter) with renamable display names. Each role has default privileges; administrators can grant extras per account. Since November 6, 2026 every Sales Manager may also reassign any lead, so a colleague's leads can be handed over while they are away; every move stays in the audit history.
- **Opportunity pool.** Scheduled keyword searches on the job-listing sources produce one card per hiring company under **Opportunities**; salespeople assign a card to themselves or a colleague, which creates the lead pre-filled, or mark it not relevant with a reason. Companies that are already leads or clients get their new listings on the lead's timeline instead. See [Opportunity pool](#opportunity-pool).
- **Duplicate guard.** A new lead that matches an existing one on client email, website, phone number, or company name is refused with a link to that lead; a very similar name at the same address, or a match on an archived lead, warns and can be overridden.
- **Sign-in and security.** Sign in with Google only, with identity, read-only Gmail, and sending granted in one consent; no passwords are stored. Database-backed login history, per-account daily auto sign-out at a configurable time, and rate limiting. On a stack without a Google client (the browser suite) the email-and-password sign-in with scrypt hashes, two-factor codes, and reset links remains available.
- **Leads.** All BRD section 6 fields plus the status reasons from the October 2026 change note (Lost Lead and Disqualified ask for a reason and display as “Status – Reason” everywhere), owner as a user reference, creator becomes owner, transfer and administrator reassignment (open tasks follow the lead), bulk archive, restore, and reassign, independent archive search, and queued leads for historical first-contact dates with approve and reject.
- **Timeline.** Logged calls, emails, visits, and interaction notes, plus automatic entries for status, BD action, client response, follow-up, transfer, state, task, and file events. Most recently active leads sort first.
- **Emails (Gmail).** Each user can link their Gmail account; a lead's Emails tab lists recent messages to or from the lead's client addresses with direction, sender, recipients, subject, time, and body text. Administrators see every connected mailbox. Dormant until a Google OAuth client is configured.
- **Search and filters.** Keyword search across lead fields and notes; filters for lead type, status and status reason, category, size, city, owner, client response, BD action, and date ranges; sortable, paginated lists.
- **Tasks.** Tasks with lead, assignee, due date and time, priority, description, and checklist. Due dates can be typed in words (“next Monday at 10am”, “in two weeks”, “Feb 1”, “January”) and are shown for confirmation before saving; month names and relative periods skip weekends and business-calendar holidays. Follow-ups scheduled from a lead set the follow-up date and create a reminder task, and a note that mentions a next step with a date (“follow up next week”, “send the proposal by Friday”) offers to create that task when the note is saved.
- **Sales trip planner.** Define a trip by title, address, radius in kilometres or driving minutes, business type, and number of results (up to 50); the companies found are listed with address, distance, a hiring count that opens the job listings, and an Action computed by matching each company against existing leads and clients (website domain, phone, name, address) and shown as the lead's status, including “Lost Lead – reason” and “Disqualified – reason”. Sort any column, filter by Action, shortlist, set planned visit dates, export to Excel, or print the field-visit report. Sample data by default; live providers plug in behind a small interface. Google calls are metered per month against budgets under Settings → Google Maps usage, with a live usage card on the planner pages and administrator alerts at 80% and 100%.
- **Files.** Documents and a separate Resumes/Profiles Shared area, with in-app preview for PDF, images, text, and Word files, version numbers for re-uploads, and administrator soft delete.
- **Notifications and digests.** A bell in the top bar collects task assignments and changes, lead status changes, transfers, queued-lead events, file uploads, and client emails found by the mailbox watch, with unread counts and one-click navigation. Every Sales Manager and Admin gets a daily digest (overdue and upcoming follow-ups, tasks, leads needing attention, yesterday's counts) and a weekly digest (last week's numbers, targets, team totals for admins), in-app and by email; each person chooses what they receive, and administrators set the schedule or send one at once.
- **Action center.** Calls, emails, and visits this week versus last week, overdue, today, and tomorrow follow-ups, target progress, leads that have gone quiet for longer than their limit (a default number of days plus Admin rules per status and BD action), open tasks, and recent leads.
- **Targets and reports.** Target templates per productivity stage, assignment per person, and reports for today, yesterday (business day), this week, last week, month to date, last month, and year to date with drill-down to the underlying records and Excel, PDF, or CSV export. Team reports filter by person, productivity stage, and target template. Tool-engagement counts (logins, updates, tasks, files) are included.
- **Administration.** User management with terminate-and-reassign, list-of-values management with rename that flows through to existing leads, target templates, and settings (role names, reminder days, and the business calendar of public holidays).
- **Audit.** Every create, update, transfer, approval, archive, file, task, user, value, and settings change is recorded with actor, time, and before/after values. Lead history is shown on the lead for administrators.

## Not yet connected

Stored email threads with reply and forward, AI summaries, OCR of business cards, presence and typing indicators on collaboration threads, mobile push notifications, device authorization, and review data (the sales trip planner searches Google Maps once `MAPS_API_KEY` is set and shows sample companies otherwise; hiring data comes from the configured job sources). Lead generation and the road visit planner show sample content. Designs for these are in SPEC.md section 10.

## Checks and tests

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit     # date parser, status helpers, trip matching, reminder rules, digest schedule (node:test, no database needed)
```

Inside Docker, prefix each with `docker compose exec app`.

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `master` and every pull request: typecheck, lint, and the unit tests on Node 22, then the browser suite through `scripts/e2e.sh` on the GitHub runner's Docker. Screenshots of failed browser tests are attached to the run as the `e2e-failures` artifact.

As of October 31, 2026 the checks job passes but the browser job fails on every run (its logs have not been examined yet), so the browser suite is verified locally with `scripts/e2e.sh`, where all 54 tests passed on October 31, 2026. The repository moved to `github.com/heypankajp/leadtrailpro` with the rename; the old address redirects.

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
| `04-team.test.mjs` | Create a Sales Manager, assign them a task, a per-account sign-out time ends a session started before it, role-limited navigation, the task shows in the notification bell, historical date queues a lead, admin approval, transfer, termination hand-off, terminated account cannot sign in |
| `05-admin-reports.test.mjs` | List of values, role rename reflected in the sidebar, a needs-attention rule that shows on the Action Center, a set-password link read from the stub outbox and used to reset the password, the daily digest sent on demand, business-calendar holiday, target template, report drill-down, stage filter, PDF and Excel export responses, action-center metric link |
| `06-trips.test.mjs` | Plan a sales trip on the stub provider, a lead recognised by website domain, job listings dialog, shortlist and planned visit, Show and Action filters, Excel export response, trip list |
| `07-accessibility.test.mjs` | axe-core WCAG 2.1 A/AA audit of the sign-in screen, Action Center, lead dialog, lead list, tasks, reports, settings, list of values, user management, and trip planner; serious or critical findings fail |
| `08-opportunities.test.mjs` | A search on the sample source, Run searches now, cards in the pool, Assign as lead with the pre-filled form and the Timeline entry, the duplicate guard, Not relevant and Back to the pool |

- Tests are written with `node:test` and `selenium-webdriver`; the page helpers (labels, dialogs, toasts, navigation) live in `tests/e2e/helpers/ui.mjs`, test data and the bootstrap shortcut in `tests/e2e/helpers/data.mjs`.
- Watch the browser at [http://localhost:7900](http://localhost:7900) while a run is in progress.
- A failed test leaves a screenshot and the page DOM in `tests/e2e/output/` (ignored by Git).
- The test app runs on plain HTTP inside the compose network, so it starts with `APP_URL=http://app-test:3000` (see the configuration table). Inside the dev container, `npm run test:e2e` runs the same files against the `test` profile hosts.

## Troubleshooting

### Find the cause first

Run these where the app runs. For the Docker stack use the commands as written; on a server add `-f compose.yaml -f compose.prod.yaml` after `docker compose`; without Docker drop the `docker compose run --rm app` prefix and run the `npm` commands in the project directory.

```bash
docker compose ps                                  # db must be "healthy", app and jobs "Up"
docker compose logs --tail 50 db app               # last lines of both; an app that cannot reach PostgreSQL says so here
docker compose run --rm app npm run db:check       # connects exactly as the app does, then names the cause and the fix
docker compose run --rm app npm run mail:test      # the same for the SMTP mailbox (add -- --send to deliver a test email)
```

`db:check` prints the host, port, user, and database it is trying on its first line; that alone settles most cases. On success it reports the PostgreSQL version, the number of tables and migrations, the number of accounts, and `Database check passed.`

### Database connection messages

| What you see | Cause | Fix |
|---|---|---|
| `Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD in .env.local.` (app) or `Missing PGHOST, …` (db:check) | No `.env.local` next to `package.json`: the setup never ran, or ran in another directory | `docker compose run --rm setup`, or `npm run db:create` then `npm run db:user:create` |
| `getaddrinfo ENOTFOUND db` | `.env.local` was written by the Docker setup (`PGHOST=db`) but the app or a script runs on the host | Run it inside Docker (`docker compose run --rm app …`), or for a host process set `PGHOST=127.0.0.1` and `PGPORT=5433` |
| `connect ECONNREFUSED 127.0.0.1:5432` on the host | The Docker database is published on 5433, not 5432; or the `db` container is not running | `docker compose ps`; use port 5433 (or your `DB_PORT`) |
| `connect ECONNREFUSED 127.0.0.1:5432` inside a container | `.env.local` points at the host's PostgreSQL | Inside the compose network the database is `PGHOST=db`, `PGPORT=5432` |
| `password authentication failed for user "leadtrailpro_app"` | `.env.local` and the database disagree: the setup ran again elsewhere, the file was copied from another machine, or the volume was recreated | Re-run the setup; it sets a new password and rewrites `.env.local` |
| `password authentication failed for user "postgres"` during the setup | `POSTGRES_PASSWORD` in `.env` changed after the database volume was first created | PostgreSQL keeps the password it was initialised with: restore the old value, or `docker compose down -v` and start over |
| `database "salestrackpro" does not exist` | `.env.local` predates the rename of October 30, 2026 | See "After the rename from SalesTrackPro" below |
| `database "leadtrailpro" does not exist` | PostgreSQL is running but the schema was never created there | `docker compose run --rm setup`, or `npm run db:create` |
| `role "leadtrailpro_app" does not exist` | The schema exists but `npm run db:user:create` (or the setup service) never ran | Run it |
| `dependency failed to start: container leadtrailpro-db-1 is unhealthy`, or `Bind for 127.0.0.1:5433 failed: port is already allocated` | Another PostgreSQL, or the old `salestrackpro` stack, holds the port | `docker compose -p salestrackpro down`, stop the other server, or set `DB_PORT` in `.env` |
| `the database system is starting up` (`57P03`) | PostgreSQL is still initialising | Wait a few seconds and retry |
| `exec /usr/local/bin/docker-entrypoint: no such file or directory` when the app container starts (Windows) | Git converted `scripts/docker-entrypoint.sh` to CRLF line endings | `.gitattributes` now forces LF for `*.sh`; on an older clone run `git config core.autocrlf false`, re-clone, and `docker compose build` |

### Application messages

- **"Could not load the workspace" right after signing in** on an `http://` host other than localhost: the browser dropped the Secure session cookie. Set `APP_URL` to that `http://` origin in `.env.local`, or serve the app over HTTPS.
- **"Request origin rejected"** behind a proxy: set `APP_URL` (or `TRUSTED_ORIGINS`) to the public origin, and make sure the proxy forwards `X-Forwarded-Host` and `X-Forwarded-Proto`.
- **Nothing is emailed**: under Settings → Email delivery choose the sending mailbox (someone who signed in with Google) and save; the Email log below shows every attempt and its error. A mailbox that signed in before sending was requested must sign in again and allow it. `MAIL_PROVIDER=stub` records instead of sending.
- **"Sign-in failed: these credentials are not valid or you are not registered"** after Sign in with Google: the Google email is not in the users table, or the account is deactivated. Add it under Admin → Users or to `seed/accounts.csv` and run the seed script.
- **Google shows `Error 400: redirect_uri_mismatch`**: `<APP_URL>/api/auth/google/callback` is not registered on the OAuth client (the match is exact, including http or https and the port). **`Error 403: access_denied`** or "has not completed the Google verification process": the consent screen has gone back to Testing and this account is not a test user; publish it again (Audience → Publish app) or add the account as a test user. **"Google hasn't verified this app"** on a first consent is expected: click Advanced and continue.
- **No "Sign in with Google" button** (the password form shows instead): `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing; `curl http://localhost:3000/api/auth/session` shows `"googleSignIn":false`.
- **"The Sales Trip Planner is not configured"**: no `MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) and no stub. Add the key to `.env.local`, or for sample companies put `TRIPS_PROVIDER=stub` in `.env` (Docker) or `.env.local` (without Docker). With the stub active the key is never used.
- **"The Google Maps monthly budget for … is spent"**: the planner stopped at the budget under Settings → Google Maps usage. Wait for the 1st of the month, raise the budget (usage beyond Google's free allowance is billed), or search with a radius in km, which makes no Routes call.
- **Port already in use**: set `APP_PORT` or `DB_PORT` in `.env` and run `docker compose up -d` again.
- **Everyone was signed out after a deploy**: expected once, when the rename of October 30, 2026 changed the cookie names.
- **The app container keeps restarting or shows an old version** after a `git pull`: it reinstalls dependencies when `package-lock.json` changed, which takes a minute; `docker compose logs -f app` shows the progress. `docker compose build` refreshes the image itself.
- **A page is blank or an action fails without a message**: `docker compose logs --tail 100 app` has the server-side error; the browser's console (F12) has the client-side one. Both are safe to paste into a report.

### Still stuck

Send the full output of `npm run db:check` and of `docker compose logs --tail 100 db app`, the exact message from the screen, and which path you followed (Docker, without Docker, or server). The step-by-step guide with the expected output of every step is [docs/TESTING.md](docs/TESTING.md).

### After the rename from SalesTrackPro (October 30, 2026)

Only for a machine that ran the old stack; a fresh clone needs none of this.

The compose project is now `leadtrailpro`, so Docker creates new volumes (`leadtrailpro_postgres_data`, `leadtrailpro_node_modules`, `leadtrailpro_next_cache`) and new images (`leadtrailpro-dev`, `leadtrailpro`); the old `salestrackpro_*` volumes and images are left as they are. The database and the app role now default to `leadtrailpro` and `leadtrailpro_app`, and the session cookies have new names, so everyone signs in again after the upgrade. On a machine that ran the old stack, pick one:

- **Start fresh.** `docker compose run --rm setup` creates the new database and rewrites the database lines of `.env.local` (every other setting is kept); then `docker compose up -d`, complete first-time setup again, and optionally seed sample data.
- **Keep the old data.** Stop the old stack, let compose create the new volume, stop the database, copy the old cluster over it, and start the database again:

  ```bash
  docker compose -p salestrackpro down            # old containers only; volumes stay
  docker compose up -d db && docker compose stop db
  docker run --rm -v salestrackpro_postgres_data:/from -v leadtrailpro_postgres_data:/to alpine sh -c "rm -rf /to/* && cp -a /from/. /to/"
  docker compose up -d db
  ```

  The copied cluster still has the old database name, role, and superuser password, so the documented defaults (and `docker compose run --rm setup node scripts/create-database.mjs` for upgrades) would not match it. Rename them, then change the two lines in `.env.local` and start the rest:

  ```bash
  docker compose exec -e PGPASSWORD=salestrackpro db psql -U postgres -c "ALTER DATABASE salestrackpro RENAME TO leadtrailpro" \
    -c "ALTER ROLE salestrackpro_app RENAME TO leadtrailpro_app" -c "ALTER ROLE postgres WITH PASSWORD 'leadtrailpro'"
  sed -i.bak -e 's/^PGUSER=salestrackpro_app$/PGUSER=leadtrailpro_app/' -e 's/^PGDATABASE=salestrackpro$/PGDATABASE=leadtrailpro/' .env.local && rm .env.local.bak
  docker compose up -d && docker compose run --rm app npm run db:check
  ```

  (If you had set `POSTGRES_PASSWORD` in `.env`, use that value instead of `salestrackpro` and keep it.) The app role keeps its password through the rename, so `.env.local` needs no other change.

- **Git remote.** The GitHub repository is now `heypankajp/leadtrailpro`. The old address keeps redirecting; `git remote set-url origin https://github.com/heypankajp/leadtrailpro.git` updates a clone.
- **Clean up** once the new stack works: `docker volume rm salestrackpro_postgres_data salestrackpro_node_modules salestrackpro_next_cache` (and `salestrackpro_attachments` if the production stack ran here) and `docker rmi salestrackpro-dev salestrackpro`.
