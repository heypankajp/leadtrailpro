# Testing LeadTrailPro on a laptop or a server

This guide takes you from a clone of the repository to a running app with sample data, shows how to prove the database connection, lists what to click, and ends with the automated checks. Pick the path that matches your machine.

| Path | Use it when | You need |
|---|---|---|
| [A. Laptop with Docker](#a-laptop-with-docker) | You want the quickest, most reproducible setup (recommended) | Docker Desktop (macOS, Windows) or Docker Engine with the Compose plugin |
| [B. Laptop without Docker](#b-laptop-without-docker) | You already run Node.js and PostgreSQL locally | Node.js 22, PostgreSQL 14 or newer with a superuser account |
| [C. Server](#c-server) | A shared test host or production | Docker Engine with the Compose plugin, a host name or IP, optionally a reverse proxy with TLS |

Whatever the path, the first command to run when something does not work is `npm run db:check`. It connects exactly as the app does and names the cause and the fix; see [When PostgreSQL does not connect](#when-postgresql-does-not-connect).

## Files you will meet

| File | Written by | Holds |
|---|---|---|
| `.env.local` | the setup (Docker `setup` service, or `npm run db:user:create`) | The app's own settings: the database connection (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`), `USER_MANAGEMENT_KEY` for the first administrator, and the email, Google, map, and job-source settings. Git-ignored, mode 600. |
| `.env.setup.local` | you, from `.env.setup.local.example` | PostgreSQL administrator credentials for the setup scripts in path B. Git-ignored. |
| `.env` | you, optional | Compose overrides: `POSTGRES_PASSWORD`, `APP_PORT` (default 3000), `DB_PORT` (default 5433), `JOBS_KEY`, `TRIPS_PROVIDER`. Git-ignored. |

Ports: the app listens on 3000; the Docker database is published on 127.0.0.1:5433 only (never on the network, and not at all in production); the browser suite shows a live view on 7900 while it runs.

## A. Laptop with Docker

1. Clone and enter the project:

   ```bash
   git clone https://github.com/heypankajp/leadtrailpro.git
   cd leadtrailpro
   ```

2. Create the database, the restricted app role, and `.env.local` (first time only; the first run also builds the development image, so allow a few minutes):

   ```bash
   docker compose run --rm setup
   ```

   Expected ending: nineteen `Applied migration …` lines (one per migration as of November 12, 2026; each release that changes the schema adds one), `The leadtrailpro schema is ready`, and `Created the restricted app role leadtrailpro_app and the user-management key in the ignored .env.local.` The accounts in `seed/accounts.csv` (in the repository) are created in the same step: the ending also lists `Created admin …` lines and `Seed accounts: N created, 0 already existed.`

3. Start the stack and watch it come up:

   ```bash
   docker compose up -d
   docker compose ps            # db "healthy", app and jobs "Up"
   docker compose logs -f app   # until "✓ Ready in …"; Ctrl-C leaves it running
   ```

4. Prove the app can reach the database:

   ```bash
   docker compose run --rm app npm run db:check
   ```

   Expected: `Connected: PostgreSQL 17 … database leadtrailpro, role leadtrailpro_app.`, the table and migration counts, and `Database check passed.`

5. Open [http://localhost:3000](http://localhost:3000) and click **Sign in with Google** with one of the accounts in `seed/accounts.csv`. Two things must be true in the Google Cloud console: the OAuth client lists `http://localhost:3000/api/auth/google/callback` as a redirect URI, and the consent screen is published (it has been since November 6, 2026; while it is in Testing the account must be a test user). Before signing in, `curl http://localhost:3000/api/auth/session` answers `{"user":null,"needsSetup":false,"googleSignIn":true}`. Only if the accounts file were empty would the screen offer **First time setup** with the `USER_MANAGEMENT_KEY` from `.env.local` instead.

6. Optional sample data (demo accounts, leads, activities, tasks):

   ```bash
   docker compose run --rm setup node scripts/seed-sample-data.mjs
   ```

   Demo sign-ins, password `leadtrailpro-demo-2026`: `sarah.lee@example.com` and `michael.patel@example.com` (Sales Managers), `jordan.taylor@example.com` (Recruiter).

7. Stop with `docker compose down`; the data stays in the `leadtrailpro_postgres_data` volume. `docker compose down -v` wipes everything so you can start again from step 2.

After a `git pull`: `docker compose run --rm setup node scripts/create-database.mjs` applies new migrations only, then `docker compose up -d`; the container reinstalls dependencies on its own when `package-lock.json` changed.

## B. Laptop without Docker

1. Clone, install, and point the setup scripts at your PostgreSQL:

   ```bash
   git clone https://github.com/heypankajp/leadtrailpro.git
   cd leadtrailpro
   npm ci
   cp .env.setup.local.example .env.setup.local   # edit PGPASSWORD; PGHOST/PGPORT if PostgreSQL is not on 127.0.0.1:5432
   ```

   To use the Docker database only (`docker compose up -d db`), set `PGPORT=5433` and `PGPASSWORD=leadtrailpro` (or your `POSTGRES_PASSWORD`) in `.env.setup.local`.

2. Create the database and the app role, check, and start:

   ```bash
   npm run db:create        # creates leadtrailpro and applies the migrations
   npm run db:user:create   # creates leadtrailpro_app and writes .env.local (PGHOST and PGPORT copied from .env.setup.local)
   npm run db:seed:users    # creates the accounts in seed/accounts.csv that do not exist yet
   npm run db:check
   npm run dev              # http://localhost:3000
   ```

3. Sign in with **Sign in with Google** as one of the accounts in `seed/accounts.csv` (edit the file and run `npm run db:seed:users` again to add people). Sample data (`npm run db:seed`) is the same as in path A.

Extras on this path: `TRIPS_PROVIDER=stub` in `.env.local` gives the Sales Trip Planner sample companies (in Docker put it in `.env`; the dev stack uses Google when a Maps key is present); the digest scheduler is `npm run jobs` with the same `JOBS_KEY` in `.env.local` and in its environment.

## C. Server

Tested shape: a Linux host with Docker Engine and the Compose plugin, the app on port 3000 behind a reverse proxy that terminates TLS. The database is not published on the host at all.

On a Windows server with Docker Desktop the same commands work from PowerShell; only the two shell lines below differ. Create `.env` with any long random strings, for example:

```powershell
$rand = { -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ }) }
"POSTGRES_PASSWORD=$(& $rand)`nJOBS_KEY=$(& $rand)`nTRIPS_PROVIDER=stub" | Set-Content -Encoding ascii .env
```

Keep Git's line endings as they are (`git config core.autocrlf false` before cloning) so the shell scripts in the image stay LF; the README's troubleshooting table has the symptom if they do not.

1. Clone and create `.env` with the two required secrets (any long random strings) and the optional sample-data switch:

   ```bash
   git clone https://github.com/heypankajp/leadtrailpro.git && cd leadtrailpro
   cat > .env <<EOT
   POSTGRES_PASSWORD=$(openssl rand -base64 36)
   JOBS_KEY=$(openssl rand -base64 36)
   TRIPS_PROVIDER=stub
   EOT
   ```

   On a server `TRIPS_PROVIDER` must be in `.env`, not `.env.local`: compose passes it to the container and an empty value there means "use the real providers". When a Google Maps key will go into `.env.local`, leave the `TRIPS_PROVIDER` line out so the planner searches Google; the key, the monthly budgets, and the recommended Google-side caps are in the README under "Google Maps key and the usage budget".

2. Create the schema, the app role, and `.env.local`: The same step creates every account in `seed/accounts.csv` that does not exist yet, so check that file first (the administrator must be on it):

   ```bash
   docker compose -f compose.yaml -f compose.prod.yaml run --rm setup
   ```

3. Edit `.env.local`: set `APP_URL` to the address users will type (`https://sales.example.com`; for a plain-http test host `http://<host>:3000`, which also makes the session cookie work without TLS), and either keep `MAIL_PROVIDER=stub` or fill in the `SMTP_*` lines (`docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run mail:test -- --send` checks them). Also paste the Google OAuth client values (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `MAIL_PROVIDER=gmail`), register `https://<your domain>/api/auth/google/callback` on that client, and the consent screen must be published (it is); no test users are needed, and each person's first consent shows Google's unverified-app warning, which they pass through Advanced.

4. Build, start, check, and watch:

   ```bash
   docker compose -f compose.yaml -f compose.prod.yaml up -d --build
   docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run db:check
   docker compose -f compose.yaml -f compose.prod.yaml logs -f app
   ```

5. Put a reverse proxy in front that forwards `X-Forwarded-Host` and `X-Forwarded-Proto` (Caddy: `sales.example.com { reverse_proxy localhost:3000 }`), open only 80 and 443 on the firewall, then do the first-time setup in the browser as in path A step 5. Sample data: `docker compose -f compose.yaml -f compose.prod.yaml run --rm setup node scripts/seed-sample-data.mjs`.

Later on the server:

- Upgrade, since November 12, 2026: nothing to do on the server. The `deployer` container notices a push to the branch within a minute, rebuilds, lets the `migrate` container upgrade the database, and restarts the app; from any machine with an API token, `npm run remote -- deploy-status` shows the commit that is running and the last deploys, and `npm run remote -- deploy` asks for one now. By hand it is `git pull` and `docker compose -f compose.yaml -f compose.prod.yaml up -d --build` (the database upgrade is part of it). The older way, still valid:

  ```bash
  docker compose -f compose.yaml -f compose.prod.yaml run --rm -e PGUSER=postgres -e PGPASSWORD=<POSTGRES_PASSWORD> app node scripts/create-database.mjs
  docker compose -f compose.yaml -f compose.prod.yaml up -d
  ```

- Backup: `docker compose -f compose.yaml -f compose.prod.yaml exec db pg_dump -U postgres leadtrailpro > leadtrailpro-$(date +%F).sql`, plus the `leadtrailpro_attachments` volume for uploads.
- New people: add them to `seed/accounts.csv`, commit, `git pull` on the server, then `docker compose -f compose.yaml -f compose.prod.yaml run --rm setup node scripts/seed-users.mjs` (only missing emails are created; existing ones are never changed). Or add them under User management in the app, which needs no redeploy.
- The Indeed search on a schedule (for example every Monday at 06:00): the `jobs` container does it; set the day, time, source, and cap under Settings → Opportunity searches, enable Indeed with a budget under Job sources (the panel shows the calls, the credits they cost, and HasData's live balance; `npm run jobs:test -- --balance` reads the balance from the shell), put `HASDATA_API_KEY` and `BUSINESS_TIMEZONE` in `.env.local`, and add the searches under Opportunities → Searches & runs. Full steps in the README under “Scheduling the Indeed run”, including the curl line for Windows Task Scheduler if you prefer it to the container.
- Logs: `docker compose -f compose.yaml -f compose.prod.yaml logs --since 1h app jobs`.

### Pushing without releasing

On the server a push to the followed branch goes live by itself. To push work that should not be shown yet, pause deploys first: **Settings → Releases → Pause deploys**, or `npm run remote -- deploy-pause` from another machine. The pushed version then waits (`npm run remote -- deploy-status` says "PAUSED" and "A newer version is waiting"). Release it with **Deploy now** or `npm run remote -- deploy`; the pause stays on for the next push until **Resume automatic deploys** or `npm run remote -- deploy-resume`.

## What to test in the app

Since November 13, 2026 the app uses Pipedrive's layout and names: the records the team works on are **Deals** (formerly leads) and the companies waiting to be picked up are **Leads** (formerly opportunities). The menu on the left reads Action center, Deals, Leads, Contacts, Activities, Insights, then To Do and the planners, then the administration pages. The "+" next to the search box adds a deal or an activity from any page.

Each line is a short path a tester can follow after the first administrator exists (sample data makes the lists fuller).

- **Action Center**: overdue and due-today follow-ups, open tasks, deals needing attention, deals with no next step, targets.
- **Deals → board**: open **Deals**; the board shows one column per stage with the number of deals under each name. Click **+ Deal** (or the "+" in the top bar, or the "+" that appears at the bottom of a column): the dialog has the deal on the left and the person and organization on the right. A new deal sits in New Deal. Drag its card to Contact Made, or use the arrows that appear on the card; the "What's next?" prompt opens pre-filled (a call on the next business day): save it or skip. Click Undo in the bar above the board. The mark at the top right of a card is green when a next step is planned, red when it is overdue, amber when nothing is planned. Switch My deals / Everyone, filter by status, search.
- **Deal page**: click a card or a row. The deal opens as a page (the address ends in `#/deal/<number>`); the arrow at the top left goes back to where you were, with your filters and place kept. Across the top: status, owner, Edit / Transfer / Archive, then the stage bar (click another stage and confirm). On the left, four panels that open and close: **Summary** (stage, BD action, client response, To Do list, follow-up), **Person**, **Organization**, **Overview**. On the right: the composer (**Add note**, **Log call**, **Log email**, **Log visit**, **Schedule follow-up**), **Focus** (open tasks and the next follow-up; Create task) and **History** (Timeline with the All / Notes / Activities / Changes filters, Collaboration, Emails, Documents, Profiles shared, Audit). Try: set the BD action to Shared Profiles under Summary (the deal jumps to Profile Shared and the Timeline shows "Stage changed from … to Profile Shared"); write a note with a phrase like "call back next Tuesday" and accept the suggested follow-up task; upload a document; post a message with an @mention under Collaboration; change the status to Disqualified with a reason.
- **Deals → list, archive, queue**: the icons next to the Deals heading switch between the board, the list, the archive and (for people who approve) the deals queued for approval. In the list, My deals / Everyone chooses whose deals are shown; tick two deals and use Move to stage, Move to To Do, Archive selected or Reassign owner in the bar above the table. Archive a deal from its page and restore it from the archive.
- **Contacts** (start from a contact): open **Contacts → People** and click **+ Person**; give a name and type a new organization, save. The person's page opens with "No deals yet"; the organization is a link. Click **+ Deal**: the add-deal dialog is filled from the contact; save, and the deal page shows the person and the organization as links. Follow the organization link: its page lists its people and deals. Click **+ Deal** there for a second deal of the same organization (no duplicate warning, because it is added from the organization). **Edit** the organization's address and open one of its deals: the Organization panel shows the new address. Under **Organizations**, add one with **+ Organization** and **Remove** it again (only a contact without deals can be removed). Every deal that existed before, and every deal the tracker import brings, already has its person and organization here.
- **Deal value** (optional): in the add-deal dialog type a **Value (CA$)** such as 25,000 and an **Expected close date**; the deal page shows both under Summary, the card shows the value, and the stage heading shows the total. Leave them empty on another deal: nothing extra appears.
- **Notes on a contact, merge, timeline**: on a person or organization page use **Add note** or **Log call** without any deal; the entry appears in History. **Edit** a person who has no deals and type another organization to file them there. Add an organization with a misspelt name, then open the right one, click **Merge**, type the misspelt name, pick it and merge: its people and notes arrive and it is gone from the list. **Contacts → Timeline** shows each person with a count in the months they were contacted.
- **Several pipelines** (administrator): List of values → **Pipeline stage** → type a name next to **+ Pipeline** and add it; it starts with the stage "New"; add more stages (a name the default pipeline uses is fine). On the Deals board a pipeline picker now appears. Add a deal and choose "<pipeline>: New" under Pipeline stage: it shows on that pipeline's board only, and its stage bar has that pipeline's steps. Switch the pipeline off again under List of values to hide its board.
- **Pipeline administration** (administrator): List of values → BD action shows the stage each action lands a deal in; change one, then use Recompute stages from BD actions. Settings → Needs-attention rules carry a stage (six are seeded); Settings → Pipeline next steps sets the step each stage suggests and the two switches (ask for the next step; create it automatically).
- **To Do**: open a deal and choose **To be visited** under To Do list in the Summary panel; the Timeline shows "To Do: added to To be visited". Open **To Do** in the menu: the deal is under its tab, the tab and the menu show the count, and My deals / Everyone switches whose deals are listed. Tick the deal and use **Take off To Do**. As an administrator add another list under List of values → To Do list; in the deals list tick a few deals and use **Move to To Do**.
- **Activities** (the tasks): complete a checklist item, comment on a task, mark all notifications read from the bell. "+" → Activity adds a task from any page.
- **Settings**: Email delivery shows every message the app "sent" in stub mode (use **Forgot password** on the sign-in screen and open the reset link from here); Business calendar, Needs-attention rules, Job sources.
- **User management**: add a user and send the set-password link; it appears under Email delivery in stub mode.
- **Sign in with Google**: sign out, click **Sign in with Google**, pick a Google account whose email exists under User management; a Google account that is not registered gets "Sign-in failed: these credentials are not valid or you are not registered. Please contact your administrator." The first Google sign-in also asks for read-only Gmail; afterwards a deal's Emails tab shows the mailbox as connected.
- **Sales trip planner**: plan a trip from an address on the sample provider, shortlist a company, export to Excel.
- **Leads** (the inbox, formerly Opportunities): as an administrator, add a search under Leads → Searches & runs (job title “baker”, location “Mississauga, ON”; the form is pre-filled from Settings → Lead searches) and click Run searches now; the Inbox shows three sample companies. **Convert to deal** on one (the form is pre-filled, pick the owner), mark another not relevant and bring it back. Then try to add a deal with the same company name: the duplicate guard points to the existing deal.
- **Insights** (the analytics): as an administrator the Team board heads the page (click a salesperson's number for the deals behind it); then pick Last 30 days, then a custom range; filter by status or industry; click a status tile for the deals behind it; under By stage click a stage tile for the deals in that stage, then read Stage over time and Time in stage (they fill as deals are moved); read the stalled-deals reasons and open one; export the stalled list as CSV. Change the period and filters of the reports and export CSV, Excel, and PDF.
- **Send email** (needs the Google client and a connected mailbox): open a deal with a client email, History → Emails, Send email; the message appears in the trail and on the timeline, and Reply keeps the thread.
- **Email delivery** (administrator): Settings → Email delivery, choose the sending mailbox and save; the Email log below shows what was sent.
- **Releases** (administrator): Settings → Releases shows the version the server runs. **Pause deploys** holds pushed changes back until someone presses **Deploy now**; **Resume automatic deploys** lets a push go live by itself again. On a laptop no deployer runs, so Deploy now is greyed out.
- **Digest**: Settings → "Send me today's digest" puts a digest in the outbox and the bell.
- **Old addresses**: `#/pipeline`, `#/all-leads`, `#/lead/<number>`, `#/opportunities`, `#/tasks` and `#/reports` from bookmarks or old emails still open the matching new page.

## Automated checks

Inside the dev container (`docker compose exec app …` while the stack runs, or `docker compose run --rm --no-deps app …`), or directly on a laptop from path B:

```bash
npm run typecheck
npm run lint
npm run test:unit     # 185 tests, no database needed
npm run build
```

Browser suite (Selenium in Docker, about ten minutes, 93 tests in 12 files as of November 13, 2026): `scripts/e2e.sh`, or one file with `scripts/e2e.sh tests/e2e/02-leads.test.mjs`. Watch it live at [http://localhost:7900](http://localhost:7900); failed tests leave screenshots and page sources in `tests/e2e/output/`. It uses its own throwaway database and never touches your data.

GitHub Actions runs the same checks on every push and pull request. As of October 31, 2026 the typecheck, lint, and unit-test job passes and the browser job fails on the GitHub runner on every run, while the same suite passes locally; the job's log on the Actions tab of the repository is the next thing to read.

## When PostgreSQL does not connect

Run `npm run db:check` where the app runs (`docker compose run --rm app npm run db:check` for the Docker stack, with `-f compose.yaml -f compose.prod.yaml` on a server). Its first line tells you which host, port, user, and database are being tried, and that alone resolves most cases; on failure it prints the cause and the fix. The full table of connection messages, the application messages, and the commands to run first are in the README under [Troubleshooting](../README.md#troubleshooting).

If the message is not in that table, send the full output of `npm run db:check` and of `docker compose logs --tail 100 db app` with your report.
