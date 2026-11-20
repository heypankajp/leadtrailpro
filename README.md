# LeadTrailPro

LeadTrailPro (renamed from SalesTrackPro on October 30, 2026) is a sales workspace for a staffing and recruitment business, built from the Sales Tracker BRD/SRS. Deals, interactions, tasks, documents, candidate profiles, targets, reports, users, and the full audit trail live in PostgreSQL behind a Next.js application. Phase 1 (the core workspace), notifications, collaboration threads, the deals board and contacts, and the Google (sign-in, Gmail, Maps) and Indeed (HasData) integrations are implemented; what is still planned is under [Not yet connected](#not-yet-connected). The requirements with their status are in [docs/PRD.md](docs/PRD.md) and the technical design in [docs/SPEC.md](docs/SPEC.md).

> **Installing it?** Follow the short guide, [docs/SETUP.md](docs/SETUP.md): a laptop in five steps, the server in six, and how to release a change, with the exact commands. The sections below hold the detail behind it.

## At a glance

> **Names since November 13, 2026.** The app uses the usual sales-CRM layout and names: the records the team works on are **Deals** (they were called leads), and the companies waiting to be picked up are **Leads** (they were called opportunities, the opportunity pool). The menu reads Pipeline (the deals; the entry said "Deals" until November 16, 2026), Leads, Contacts, Activities (the tasks), Sales Trips, Clients, Insights (the analytics), then our own tools (Sales Trips and Clients since November 18, 2026, when the menu items, and the list names under List of Values, also moved to Title Case). Only the words people read changed: the code, the tables, the API paths (`/api/leads`, `/api/opportunities`) and the requirement IDs (LEAD-*, OPP-*) keep the old names. Design and status: `docs/SPEC.md` §10.13.
>
> **Company since November 19, 2026.** What the screens called an organization is a **Company**: the Contacts tab (Contacts, Companies, Timeline), the Add deal form, the activity form, every message. A company's page is `#/company/<id>` and the tab is `#/contacts/companies`; the earlier addresses keep working. As with Deals and Leads, only the words people read changed: the code, the tables (`organizations`) and the API paths (`/api/contacts/organizations`) keep the word. Design: `docs/SPEC.md` §10.22.
>
> **Also since November 19, 2026.**
> - A card's ⋯ menu has **Move to stage** again, as one line that opens the stages: a card cannot be dragged on a phone or with the keyboard.
> - The button of the ready-made filters reads **Quick filters** (it read Filter, next to the Filters panel).
> - **Schedule an Activity** is one dialog everywhere. The deal page's tab and a card's Add follow-up open it with the deal linked; the subject offered names the contact ("Call Adam Brooks"), and an open activity sets the deal's next follow-up date. The smaller form those two places had is gone.

> **Since November 16, 2026** (the colleague's comments on the live version):
> - The menu entry for the deals is **Pipeline**. "Person" is now **Contact**, and every contact belongs to a company (migration 27).
> - Add deal starts from the company, picked from a list that appears as you type, with city and open deals. Typing a contact's name or email finds the contact and fills their company too. A new company or contact is created only after a confirmation.
> - A deal's emails cover every contact of its company.
> - The board fills the window, its columns scroll on their own, and its scrollbar stays in view.
> - Sales Managers and Admins edit the stages from the board (**Edit pipeline**).
> - A card's ⋯ button opens one menu: move, follow-up, To Do list, archive (since November 18, 2026 without move and with Convert to Client; see below).
> - The boards have a date filter, and a second board groups deals by status.
> - On the deal page, "Log email" became an **Emails** tab.
> - "Deal type" is now **Deal source**, and **Referral** was added to its list (migration 28).
> - On the boards, a deal is added from its stage: the "+" at the foot of each column, or the column's "…" menu, which also opens that stage in the list. The "+ Deal" button stays on the list only.
> - **Schedule activity** (on the deal page, and **Add follow-up** in the card menu) takes a type (call, email, visit, task), a time slot, a priority, who does it, a note and **Mark as done**, and shows that person's day beside it (migration 29). Focus shows each item's type, priority and an Overdue badge.
> - A **Quick filters** menu (called Filter until November 19, 2026) on the boards and the list offers ready-made filters (open, lost, won, older than 3 months, quiet, archived; since November 18, 2026 the quarters and Followup replace "older than 3 months" and "quiet") and **Data cleanup** filters (stuck in New Deal for a year, no stage, deactivated owners, close date passed, no next step, no stage change in 3 months, no update in 12 months). The list's bulk actions do the clean-up.
>
> Design and as-built notes: `docs/SPEC.md` §10.19; requirements: PRD §3.27.

> **Since November 18, 2026** (the colleague's review file and the requests that followed):
> - **Add deal** shows the pipeline stage as green arrows (light to dark green, one per stage): click one to pick the stage. Contacts are looked up only among the chosen company's contacts, also when the dialog opens from a company's page.
> - A card's ⋯ menu: Add follow-up, Add to To Do list, **Convert to Client** and Archive (Move to stage was taken out here and is back since November 19, 2026). Converted deals are listed under the new **Clients** menu entry.
> - **Archive** asks for an **Archival reason** (a new List of values: Approach Later, Not Interested, Do not use Agency, No Response, Not Hiring, Inactive Deal, Other) and optional notes; the Archive shows both (migration 30).
> - The **Quick filters** menu has **Followup** (a calendar for a day or a period of follow-up dates) after Open deals, and **By quarter**: the current quarter and the three before it, then Quiet Deals for older ones. "Deals older than 3 months" and "Quiet deals" are gone.
> - The To Do page opens on Everyone, so a colleague's deal put on To be visited shows there.
> - **Sales Trips** (migration 31): select deals under To Do → To be visited and choose **Add to sales trip** (title and date); they leave To be visited. The Sales Trips page lists every trip, the Sales Trip Planner's included, with My Trips / Everyone, a user filter, a **By Period** calendar and a search on title, company, contact, city and address. Deleting a trip asks whether its deals go back to To Do, stay in the Pipeline only, or are archived.
> - **Activities** has three views (icons at the top right): Activity Dashboard, Activity List (type and period filters, contact, email, phone, company) and Activity Calendar (a week; click a slot to add). Activity types are Call, Meeting, Task, Deadline, Email, Lunch and Visit; Mark as done can record an **Outcome** from List of Values → Activity Outcome (migration 33).
> - **Create task** is now **Schedule an activity**, with the person's day on the right, a description, a yellow note, and files uploaded on the activity (migration 34).
> - An activity is linked to an **Company** and a **Person** (a contact of that company), with or without a deal; new ones are added from the list with a blue NEW badge (migration 35).
> - Two contacts cannot have the same email address or phone number: adding one is refused and names the contact who has it.
> - **Contacts** and the **Pipeline list** have an A–Z index down the right side with letter headings.
> - **List of Values → Sales Trip Planner** holds the planner's settings on one page: Max Radius (km) and Number of Results (max), 50 each to start (migration 32), Recent Planned Trips (How Many), and the Business Type list.
> - **List of Values → Pipeline Stage** can delete a stage. One that still holds deals is not deleted until they are moved: by hand (the Pipeline list opens on that stage) or all at once to a stage you pick.
> - **Lead Disqualified Reason** (the Disqualified reasons, renamed in List of Values) takes new values like any other list, and its values can be switched off.
> - The planner's list is **Recent Planned Trips**: the latest trips, ten to a page, as many as List of values → Recent Planned Trips (How Many) says (30).
>
> **Since November 19, 2026:**
> - **Add company** has **Website** as its second field with a **Fetch** button: LeadTrailPro reads the company's website (its structured data, title and description, then its Contact us, locations or about pages) and fills the **name**, **industry**, **city** (matched to the City list) and **address**. When the website gives no address and `MAPS_API_KEY` is set, the address comes from Google Maps (one Places text search, counted against the planner's monthly budget). What was not found is shown in red; a company found outside Canada asks before anything is filled. Only public websites are read.
> - Fetch replaces the name typed in Add company with the one the website gives.
> - **Leads** can be **added by hand** (Add lead) and edited. A lead has a **Lead source** (the Deal Source values; the deal takes it on conversion), a **company** and **several contacts** (picked or added as in Add deal), **BD action**, **Client response** and a note. A lead found by the job searches starts with the new Deal Source **Lead Gen Tool** (migration 38), as does a deal made from Lead Discovery.
> - The preview page once called Lead Generation is now **Lead Discovery** (`#/lead-discovery`). It and the Road Visit Planner sit in a **PREVIEW** section of the menu.
> - **Lead Generation** (under TOOLS, `#/lead-generation`) lists the companies the job searches found, with Searches & runs, **Execute** (run the searches now) and **Budget**. **Leads** lists the leads added by hand and the tracker import's companies with no Sales Manager, with Add lead. Each menu entry counts its own new cards.
> - The top bar's **+** menu lists **Lead** (Add lead) first, then Deal, then Activity.
> - **Convert to Deal** (Leads and Lead Generation; every action on a lead is in its row's **Actions** menu: Convert to Deal, Edit, Not relevant, Back to the inbox, Archive, Open deal): it asks the pipeline stage, the status and the owner, and the deal takes the lead's company, contacts, Lead source, notes and roles. Leads shows only Inbox and Not relevant. **My Leads / Everyone** on Leads (the leads you added) and **By Me / Everyone** on Lead Generation (found by the searches you created).
> - Lead Generation's job-source usage (calls, credits, Within budget / Running low / Stopped) opens from a **Budget** button in a dialog instead of filling the top of the page.
> - **Archive** (last under TOOLS, `#/archives`): archived **Leads** (All, Manual, Generated) and **Deals** in two tabs, each restored from there (a lead goes back to the Inbox). A lead is archived by hand with **Archive** on Leads or Lead Generation, or by itself once it has been not relevant for the days in List of Values → **Archive Not Relevant Leads After (Days)** (90 to start; the scheduler's every-minute run, migration 42). New job ads for an archived company bring it back to the Inbox.
> - **Favourite deals**: the heart at the bottom right of a Pipeline card marks the deal as your favourite (filled red) or unmarks it; the red heart after Queued for approval filters the open view to your favourites: the board and the board by status stay boards, the list stays a list, and from the Archive or the queue it opens the list. Each person sees only their own (migration 43).
> - **Queued for approval: peer approval.** A new deal whose first contact is older than the working days set in List of Values → **Queue Deals Older Than (Working Days)** (1 to start; weekends and holidays skipped, so on a Monday Friday counts as yesterday) waits in Queued for approval, an administrator's too (the Tracker Import is exempt). Anyone who may edit deals approves or rejects it, except its owner and the person who created it, who see "Waiting for a colleague" (migration 44).
> - **Add deals to a sales trip** offers two lists: **To be Visited** (the default) and **Other Deals** (the active deals not marked To be visited, searched as you type); ticks are kept when switching, and each row shows its status.
> - A sales trip's page shows a **summary** between its title and its buttons: how many companies are planned and their cities (with a count when a city has more than one visit; an empty trip shows "Summary of Sales Trip will be shown here"). Next to Add deals, an **Actions** menu holds **Print** (a paper layout with a Visit notes column; the browser's Save as PDF works too), **Download PDF** (an A4 landscape file from the server, `GET /api/visit-trips/:id/pdf`), **Edit** and **Delete**.
> - **Title Case** (November 20, 2026) for every button, menu item, page and section heading, dialog title and form field label (AP style: articles, conjunctions and prepositions of three letters or fewer stay lower case; Sign In, Set Up and the like keep their particle capitalised).
> - **Duplicate websites** are refused when adding or editing a company, adding or editing a lead, and changing a deal's or client's website: the websites are compared without http:// or https://, "www." or letter case (`src/lib/website-key.ts`). Deals of the same company may share its website.
> - On the Pipeline board a **Hot**, **Warm** or **Cold** deal shows as the card's colour (red, amber, blue, with a coloured left edge) instead of a status label; other statuses keep their label.
> - **BD action** and **Client response** are fields of a lead, no longer of a deal: Add/Edit deal, the deal page, the list filters, the board cards and the Action Center no longer show them. Each existing deal keeps them in its **Comments** as `BD Action : <value>` and, on the next line, `Client response : <value>` (migration 39); the tracker import writes them the same way, and converting a lead writes its values there too.
> - "+ Add '…' as new company / contact" in Add deal, Schedule an Activity, Add lead and Add contact opens the **Add company** / **Add contact** dialog with the name; the record saved there is filled in. Where several contacts are allowed, a **comma** after a name adds it.
> - The deal page's **Summary** no longer has Pipeline stage (the stage bar moves the deal) or To Do list (the card menu and the list's bulk action do). Its status menu no longer offers **Client**; **Convert to Client**, a drop on Client and Client in Edit deal ask "Do you want to convert this deal to client?" first.
> - The board's status filter is a menu of coloured status chips, like Priority, starting with **All**.
> - A **client** is the pipeline's end, kept apart from the stages: its page reads **CLIENT**, has no stage bar and a read-only status, and **Move back to pipeline** puts back one converted by mistake (asking the stage and the status). Client details keep Deal source and Status read-only and show a **Closed Date**: the day of the conversion, which can be changed (migration 41 sets it for existing clients). The Clients page has **+ Client** (Add client: no pipeline stage, Status Client, an optional contract) and a CLOSED DATE column.
> - A deal or client takes its **contract**: **Upload contract** in the header opens the **Contracts** tab (preview, download, versions, like Documents).
>
> Design and as-built notes: `docs/SPEC.md` §10.21; requirements: PRD §3.28.

| | |
|---|---|
| Layout | The usual sales-CRM layout, in LeadTrailPro's own colours (November 13, 2026): a dark menu, the page title, search and a quick-add "+" in the top bar; **Pipeline** (the deals) with a view switch (board, list, archive, approval queue); a **deal page** with the details in panels on the left and the composer (note, call, email, visit, follow-up), the focus list and the history on the right; a two-column add-deal dialog; **Contacts** with People and Companies as records of their own, so work can start from a contact. Old addresses (`#/pipeline`, `#/all-leads`, `#/lead/12`, `#/opportunities`, `#/tasks`, `#/reports`) still open the right page |
| Stack | Next.js 16.4.3 (App Router, Turbopack; the October 30, 2026 security release), React 19, TypeScript 5, PostgreSQL 17 (14 or newer works), hand-written CSS |
| Packaging | Docker: hot-reloading development stack, standalone production image, one-shot setup service; in production a `migrate` service that upgrades the database on every start and a `deployer` that releases each push |
| Releases | Since November 12, 2026 a push to `master` goes live on the server by itself within minutes, with no command on the server. Since November 13, 2026 **Settings → Releases** (or `npm run remote -- deploy-pause`) holds pushes back until someone presses **Deploy now**. Since November 20, 2026 `git push origin master master:release` releases with no API token (docs/SETUP.md part C). See [Production](#production) |
| Tests | ESLint, `tsc`, production build, unit suites for the date parser, status helpers, trip matching, reminder rules, digests, KPI reports, rich text, mentions, Google sign-in and the seed accounts, the tracker import rules, the job-listing sources and their usage meter, the Google Maps meter, the mailbox watch, the leads inbox, the team board, To Do lists, and the pipeline rules (stages, next steps, reminder days per stage), and a Selenium browser suite with an axe-core accessibility audit, all in Docker; GitHub Actions runs all of it on every push and pull request; since November 13, 2026 also contacts, deal value, several pipelines and the deploy pause (185 unit tests, 93 browser tests in 12 files); since November 18, 2026 the quarter filters, archiving with a reason, the stage arrows, Followup, Convert to Client and Sales Trips (194 unit tests, browser tests in 13 files) |
| Notifications | Bell in the top bar for task, deal, queue, file, and client-email events; daily and weekly digests by email and in-app, scheduled by the `jobs` service; daily, weekly, and monthly KPI reports emailed to administrators |
| Email | Sent through the Google app from the mailbox an administrator chooses under Settings → Email delivery (`MAIL_PROVIDER=gmail`, the default once the Google client is set). `MAIL_PROVIDER=stub` records messages under Settings → Email log instead of sending (test stacks). No SMTP account is needed |
| Sales trip planner | Built from the October 2026 change note; searches Google Maps once `MAPS_API_KEY` is set, and serves sample companies with `TRIPS_PROVIDER=stub`. Google calls are metered in the app: the planner pages show everyone a live usage card (per allowance, what is left, reset date), searches stop at the monthly budgets under Settings → Google Maps usage, and administrators are notified at 80% and 100%. Hiring counts come from a job-sources layer that combines Adzuna, JSearch, and Indeed via HasData behind a cache with per-source budgets (keys optional, in `.env.local`; budgets under Settings → Job listing sources) |
| Job listings | Indeed through HasData is the live source (Adzuna and JSearch optional); per-source daily and monthly call budgets, the credits they cost and HasData's live account balance under Settings → Job listing sources, a usage card for everyone on Leads and the planner, administrator alerts at the warning level and at 100% |
| Team oversight | Insights (the analytics) opens for administrators with the Team board (per salesperson: active deals, overdue follow-ups, stalled deals, client replies waiting, this week's activity, last active; every number opens the deals); the mailbox watch flags deals awaiting a client reply and notifies owners; colleagues see a deal's client emails from any connected mailbox |
| Deals board | The board view of Pipeline (November 11 to 16, 2026): seven stages from New Deal to Contract Signed across the whole window, drag-and-drop to move a card, the card's ⋯ menu (follow-up, To Do list, Convert to Client, archive with an Archival reason; it also moved cards until November 18, 2026), a second board by status, a date filter, stages edited from the board by Sales Managers and Admins, every BD action mapped to a stage, a "What's next?" prompt after each activity or move, reminder days per stage, a stage bar on the deal page, bulk move from the lists, and the pipeline by stage on Insights and in the KPI emails (SPEC.md §10.11) |
| To Do | Lists an administrator defines under List of values, "To be visited" first (November 12, 2026). A salesperson moves a deal onto a list by hand, from the deal page or for a selection in any deal list, and takes it off by hand; the To Do page shows them per list, longest waiting first, with counts. Nothing is automatic |
| Preview pages | Lead Discovery and the road visit planner show sample content until data sources are connected |

## Quick start with Docker

The steps alone, for a laptop and for the server, are in [docs/SETUP.md](docs/SETUP.md). This section explains them and lists the everyday commands.

Requires Docker Desktop, or Docker Engine with the Compose plugin. Nothing else is installed on the machine: Node 22 and PostgreSQL run in containers, and the project directory is mounted into the app container so edits hot-reload as usual.

People sign in with **Sign in with Google**, with an address listed in `seed/accounts.csv` ([Seed accounts](#seed-accounts)). With an empty accounts file the first screen offers **First time setup** instead, which creates the first administrator with the `USER_MANAGEMENT_KEY` from `.env.local`. The long walk-through, with what to click and how to read a failed database connection, is [docs/TESTING.md](docs/TESTING.md).

Everyday commands:

| Task | Command |
|---|---|
| Start, follow logs, stop | `docker compose up -d` · `docker compose logs -f app` · `docker compose down` (data stays in volumes) |
| Lint, typecheck, build | `docker compose exec app npm run lint` (likewise `typecheck`, `build`) |
| Browser end-to-end tests | `scripts/e2e.sh` (see [Checks and tests](#checks-and-tests)) |
| Sample data (needs an administrator) | `docker compose run --rm setup node scripts/seed-sample-data.mjs` |
| Seed accounts again after editing `seed/accounts.csv` | `docker compose run --rm setup node scripts/seed-users.mjs` (adds new emails only) |
| Import the sales tracker, the first time and again whenever the sheet changes | In the app: **Administration → Tracker import** (upload the export, Preview, Apply). From another machine: `npm run remote -- import "docs/Sales Leads 2026.xlsx"` (preview) then with `--apply`, using an API token (see [Remote administration](#remote-administration-with-api-tokens)). On the server itself: `docker compose run --rm setup node scripts/import-tracker.mjs "docs/Sales Leads 2026.xlsx" --dry-run`. Only the `LeadsDec25` sheet is read, and only new and edited rows are applied; a database filled by the import before November 10, 2026 needs the baseline workbook (the one that import used) once |
| Schema upgrade after pulling code (laptop; a server started from `compose.prod.yaml` upgrades itself, see [Production](#production)) | `docker compose run --rm setup node scripts/create-database.mjs` |
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

Then complete the first-time setup in the browser as above. `npm run db:seed` adds sample data (demo Sales Managers, a Recruiter, deals, activities, tasks) once an administrator exists. `npm run db:import -- "docs/Sales Leads 2026.xlsx" --dry-run` (or the upload page under Administration → Tracker import) reads the `LeadsDec25` sheet of the client's tracker and reports what it would create or change; without `--dry-run` it imports one deal per company with a timeline entry per row, and it can be run again whenever the sheet changes: rows already imported are left alone, new rows are added, edited rows are updated in place (rules and options in SPEC.md §10.9; the report lands in `import-report.txt`). A company whose rows name no Sales Manager is given to nobody: it goes to the leads inbox as a card carrying its drafted deal and timeline, and whoever assigns it there gets the deal with that history (`--default-owner <email>` hands those companies to one person instead). Re-running `npm run db:create` after pulling new code applies any migrations that have not run yet.

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
| `ADMIN_SQL` | `off` switches off the data-correction endpoint `POST /api/admin/sql` (see Remote administration); on by default for administrators |
| `JOBS_KEY` | Shared secret between the app and the scheduler that runs the summary emails, the KPI reports, the lead searches, the mailbox watch, and the weekly report (`npm run jobs` or the `jobs` compose service; `npm run jobs` also reads `JOBS_URL`, default `http://localhost:3000`, and `JOBS_INTERVAL_SECONDS`, default 60); the production `deployer` uses it too. Docker passes it from `.env`. Required in production |
| `MAIL_PROVIDER` | `gmail` sends through the Google app from the mailbox chosen under Settings → Email delivery (the default when the Google client is set); `stub` records every email under Settings → Email log instead of sending; `smtp` (legacy) sends through the settings below; `off` disables email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Legacy SMTP mailer, used only with `MAIL_PROVIDER=smtp`; not needed with the Google app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `GOOGLE_REDIRECT_URI` | One OAuth client for **Sign in with Google** and the Gmail link on the deal Emails tab. The token key is any long random string that encrypts stored refresh tokens; the redirect URI defaults to `APP_URL/api/auth/google/callback` and is the only one to register |
| `GOOGLE_AUTH_URI`, `GOOGLE_TOKEN_URI`, `GOOGLE_PROJECT_ID` | Optional, from the same OAuth client JSON (`auth_uri`, `token_uri`, `project_id`); the endpoints default to Google's standard ones and the project id is informational |
| `GMAIL_API_URI`, `HASDATA_API_URI` | Tests only: point the Gmail calls (Emails tab, sending, mailbox watch) and the HasData calls at a local stand-in. Leave unset in normal use |
| `TRIPS_PROVIDER` | `stub` serves sample companies for the sales trip planner (the end-to-end stack sets it; for the Docker dev stack put it in `.env`), and their Hiring counts then come from the sample job source so no live job-source budget is spent on fictional names; leave empty for live data, which is the default when a Maps key is present. `JOBS_SOURCES=stub` turns on only the sample job source |
| `MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) | Google Maps Platform key for live trip searches, and since November 19, 2026 for Add company → Fetch when a company's website gives no address (one Places text search, on the same budget). Enable the **Geocoding API**, **Places API (New)**, and **Routes API** on the Cloud project (the legacy Places and Distance Matrix services are not used; Distance Matrix cannot be enabled on projects created after October 2026). `npm run maps:test -- "<address>"` checks a key with three calls. The app counts every call per month under **Settings → Google Maps usage** and stops at budgets that default to 90% of Google's free allowance per SKU (Geocoding 10,000, Places text search 1,000, Route matrix 10,000 a month, reset monthly); administrators are notified at 80% and at 100%. For a hard guarantee also cap each API's requests per day under APIs & Services → Quotas in the Cloud console and set a Cloud Billing budget alert |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adzuna job search (free developer key) for the Hiring column |
| `JSEARCH_API_KEY` | JSearch on RapidAPI (Google for Jobs) for the Hiring column |
| `HASDATA_API_KEY`, `HASDATA_INDEED_DOMAIN` | HasData Indeed Jobs Scraper API for the Hiring column and the lead searches; the domain selects a regional Indeed site (`ca` → `ca.indeed.com`). Ten credits a call, about fifteen listings a call; Indeed looks back at most 14 days, so a longer posted-within window is rounded down to 14 for this source |
| `JOBS_API_URL`, `JOBS_API_KEY` | A custom job-listing source behind the JSON contract in SPEC §7.13 |
| `JOBS_COUNTRY` | Country code for the sources that take one (default `ca`) |

Email goes out through the Google app: an administrator picks the sending mailbox under Settings → Email delivery from the people who have signed in with Google, and notifications and summary emails are sent from it.

**KPI reports to administrators.** Every administrator gets a KPI email that shows where each Sales Manager's deals stand at the moment it is sent: one row per Sales Manager, and per anyone else who owns a deal, with the number of deals, a column per status, and what is waiting on the person (overdue follow-ups, stalled deals, client replies waiting), a totals row that covers every deal, and the pipeline by stage. The daily report goes out on business days at the daily digest time and carries nothing else. The weekly one (on the weekly digest day) and the monthly one (on the first of the month) add a second table with what was recorded last week or last month (deals created and updated, calls, emails, visits, notes, conversions, tasks done, target %), listing only the people who recorded something. The three switches are under **Settings → Email delivery** (all on), and "Send me the daily/weekly/monthly KPI report" sends one at once to check the content. The period numbers are also on the Insights page with Excel and PDF export; the current state is on the Team board under Insights. Report emails (the weekly stalled-leads report to administrators) stay off until the switch next to it is on. With `MAIL_PROVIDER=stub` nothing is sent and every message is recorded under Settings → Email log, which the test stacks use. The consent screen was published on November 6, 2026, so tokens no longer expire after seven days; a token issued while the screen was still in Testing is renewed by that person signing in once more, the sending mailbox first.

Job-source keys can be tried without a trip: `npm run jobs:test -- "OceanMD" Toronto` (in Docker: `docker compose run --rm app npm run jobs:test -- "OceanMD" Toronto`) calls every configured source for that company and prints what each returns. It spends one call per source, so use it sparingly on a test plan. With `TRIPS_PROVIDER=stub` the trip planner itself never calls the live sources, because its companies are fictional.

### Job-source keys for testers

The keys live only in `.env.local`, which Git ignores; never put them in `.env.setup.local.example` or any other committed file. Two ways to give testers access:

- **Share your keys privately** (password manager, a disappearing message; not email or chat history): the two lines `HASDATA_API_KEY` and `HASDATA_INDEED_DOMAIN` (Indeed through HasData is the only live source in use since November 7, 2026; Adzuna and JSearch keys are optional extras). The tester pastes them into their `.env.local`, restarts the app (`docker compose restart app`), and checks Settings → Job listing sources or runs `npm run jobs:test`. Everyone then shares one quota, and Adzuna's test plan allows only 25 calls a day until the application is activated.
- **Each tester creates free keys** (a few minutes each, no card):
  1. Adzuna (optional; not in use since November 7, 2026): developer.adzuna.com → register → create an application → copy the Application ID and Key. New applications start as "pending activation" with 25 calls a day until Adzuna reviews them; set the source's budget under Settings → Job listing sources to 20 a day and 25 a month meanwhile.
  2. HasData: hasdata.com → sign up → account settings → copy the API key. The free plan is 1,000 credits a month; an Indeed lookup costs 10. Set `HASDATA_INDEED_DOMAIN=ca` (the app expands it to `ca.indeed.com`).
  3. JSearch (optional): rapidapi.com → the JSearch listing → subscribe to the free Basic plan → copy the `X-RapidAPI-Key` into `JSEARCH_API_KEY`.

With `TRIPS_PROVIDER=stub` the trip planner never calls these sources (its companies are fictional); `npm run jobs:test -- "<company>" <city>` is the way to see them answer for a real company.

### Job-source usage, credits, and alerts

Every call to a job-listing source is counted per day and per month against the budgets under **Settings → Job listing sources**, and a source is no longer asked once its daily or monthly budget is spent. Since November 7, 2026 the same panel shows the credits those calls cost (HasData charges 10 credits per Indeed call) and, for HasData, the account's live balance read from their usage endpoint, so the number is the same one their dashboard shows even when several stacks share the key. Administrators get a bell notification when a source reaches the warning level (default 80 percent, set in the same panel) and again when its monthly budget is spent. Everyone who opens **Leads** or the trip planner sees a usage card with this month's calls, credits, what is left, and the account balance; it refreshes after each run and every 30 seconds while the page is open. `npm run jobs:test -- --balance` asks HasData for the balance from the command line without spending anything.

### Google Maps key and the usage budget

The Sales Trip Planner searches with Google Maps Platform: the Geocoding API for the trip address, Places API (New) for the companies (with website and phone), and the Routes API for driving minutes. One key serves all three, and the app calls Google only from the server, never from the browser.

1. **Create the key**: console.cloud.google.com → the project → APIs & Services → Library: enable **Geocoding API**, **Places API (New)**, and **Routes API** (billing must be enabled on the project; the free allowance still applies). Then Credentials → Create credentials → API key, and under the key's **API restrictions** allow only those three APIs.
2. **Configure**: put `MAPS_API_KEY=<key>` (or `GOOGLE_MAPS_API_KEY=<key>`) in `.env.local` and restart the app (`docker compose restart app`). With Docker, leave `TRIPS_PROVIDER` out of `.env` or empty: `stub` there keeps the sample companies and never uses the key.
3. **Check**: `npm run maps:test -- "1 Dundas St W, Toronto"` (in Docker: `docker compose run --rm app npm run maps:test -- "1 Dundas St W, Toronto"`) makes three live calls, not counted by the meter, and names any API that is not enabled.
4. **Upgrade the schema** on a laptop after pulling a release with the meter: `docker compose run --rm setup node scripts/create-database.mjs` (migration 13 adds the `maps_usage` counters and the default budgets). A server started from `compose.prod.yaml` does this by itself.

**What is counted and where to see it.** Google's free allowance is per API and per month (Geocoding 10,000 calls, Places text search 1,000 calls, Route matrix 10,000 elements); it resets monthly and is not pooled. A search spends one geocode for a new address (re-runs reuse the stored coordinates), one Places call per page of up to 20 companies (the scarcest allowance: 1,000 pages a month is at least 300 searches), and, only for a radius in driving minutes, one route element per company found. The app counts every call per calendar month and stops at the budgets under **Settings → Google Maps usage** (defaults 9,000 / 900 / 9,000, 90% of the allowance, editable). Everyone who plans trips sees the live card on the planner pages (used, left, reset date); administrators are notified in the app, and by email if they opted in to event emails, at 80% and when a budget is spent. A refused search says which allowance is spent; the choices are to wait for the 1st, raise the budget (usage past the free cap is billed by Google), or search with a radius in km. Keep **Number of results** at 20 or fewer so a search takes one page.

**Google-side guard rails (recommended).** The app's meter is the first line; a cap in Google Cloud is the one nothing can bypass. Under APIs & Services → Quotas & System Limits set a cap on each of the three APIs where one is offered (per day or per minute; about a thirtieth of the monthly budget per day, for example Geocoding 300, Places text search 30, route matrix elements 300), and under Billing → Budgets & alerts create a budget of a few dollars with email alerts. Google's quotas apply to the whole project, so they also cover any other use of the key.

### Gmail linking

Read-only access to each user's own mailbox, and the right to send from it, are granted together with their first **Sign in with Google** sign-in (next section), and the app stores the token so nobody is asked again. A deal's **Emails** tab then lists recent messages exchanged with the deal's client email addresses; administrators see messages from every connected mailbox, and a colleague helping on a deal sees the client thread from whichever connected mailbox the mailbox watch (below) matched to that deal, even without a mailbox of their own. The tab keeps a **Connect Gmail** button for people who unticked the Gmail box on Google's consent screen or whose token expired (see the note on the consent screen below). From the same tab, **Send email** writes to the deal's contacts from the person's own mailbox, with the deal's documents as attachments, and **Reply** answers inside the thread; sent mail shows in the trail with the replies and is logged on the timeline. To enable it:

1. In Google Cloud Console, enable the Gmail API on the project of the OAuth client.
2. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GMAIL_TOKEN_KEY` in `.env.local` and restart the app. The `gmail_connections` table is created by the schema script (migration 3).

Until these exist the Emails tab explains that Gmail is not configured, and emails are logged by hand on the Timeline.

**Client replies (mailbox watch).** Every five minutes the scheduler (the `jobs` service, see Scheduling below) scans each connected mailbox for mail newer than its last scan, keeps the messages exchanged with a deal's client email addresses, and stores them per deal (`lead_emails`). When the sender is one of the deal's client addresses the deal is stamped with the client's last email time: the deal list shows "Client wrote 2 hours ago" under the client name, the deal page shows it next to the follow-up date, and the list can be sorted by it. A client email newer than the team's last email and last timeline action on that deal is **awaiting reply**: those deals appear in the Action Center panel "Client replies waiting" and in the daily digest, and the deal owner gets a bell notification (type `email_received`, emailed too for people who opted in to event emails) the moment the scan finds it. Received emails also appear on the deal's Timeline as `email` entries that do not count as sales activity. The first scan of a mailbox looks back 30 days silently (timestamps and timeline, no notifications); later scans only notify. Only message headers and the Gmail snippet are read, and only messages that match a deal are stored. Administrators switch the watch off under Settings → Email delivery.

### Sign in with Google

When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, the sign-in screen offers only **Sign in with Google**: there is no email and password form, `POST /api/auth/login` answers 403, the Change password entry disappears from the user menu, and User management has no password fields, set-password emails, or two-factor switch: a person is added with their Google address and signs in with it. Password sign-in exists only on a stack without a Google client (the browser test suite, or a laptop before the client is configured). Google is asked for the person's identity (`openid email profile`), read-only Gmail, and sending (`gmail.send`) in one consent, so the mailbox link exists from the first sign-in; the token is stored, and later sign-ins only show Google's account picker. Someone who unticks the Gmail box still signs in and gets a note to connect it later from a deal's Emails tab. The account whose email equals the verified Google email is signed in. Nobody is created on the way in: an email that is not in the users table, or belongs to a deactivated account, sees "Sign-in failed: these credentials are not valid or you are not registered. Please contact your administrator." A Google sign-in skips the email two-factor step, since Google has already verified the person, and is recorded in the login history like any other sign-in.

1. On the OAuth client, add `<APP_URL>/api/auth/google/callback` (locally `http://localhost:3000/api/auth/google/callback`) as the Authorized redirect URI. Sign-in and the Gmail link share it.
2. On the consent screen choose the External user type, so personal Gmail accounts can sign in as well as Google Workspace ones, and add the Gmail read-only and send scopes. Google calls the read-only scope restricted. While the screen is in Testing only the listed test users (up to 100) can sign in and refresh tokens expire after seven days, after which the Emails tab asks to reconnect; publishing the screen (Audience → Publish app) lifts both, and the LeadTrailPro screen has been published since November 6, 2026. Who may sign in is decided by the app alone (the users table). The app stays unverified: each person's first consent shows "Google hasn't verified this app", which they pass with Advanced → Go to LeadTrailPro, and at most 100 people over the project's lifetime can accept that screen. Google's verification for the restricted scope needs a paid yearly security assessment and is not planned.
3. Make sure each person exists with their Google email, either in the seed file below or under **User management**.

### Seed accounts

`seed/accounts.csv`, in the repository, lists the accounts that may sign in: the administrator, one account per role, and any testers. Edit it and commit; the Docker `setup` service loads it on a new machine, and `docker compose run --rm setup node scripts/seed-users.mjs` (without Docker: `npm run db:seed:users`) loads it again after edits. The format is in the file's header:

```csv
email,first_name,last_name,role,stage
admin@example.com,Ada,Admin,admin,full_productive
sales@example.com,Sam,Seller,sales_manager,full_productive
```

Roles are `admin`, `sales_manager`, and `recruiter`; the stage column (`onboarding`, `training`, `full_productive`; default `full_productive`) is optional. No password is stored: everyone signs in with Google using that address. Every row is checked before anything is written, existing emails are never changed, and from then on administrators manage everyone under **User management**. The file holds real addresses, so keep the repository private.

#### Scheduling the Indeed run (for example every Monday morning)

Nothing is installed on the server for this: the `jobs` container (part of `docker compose up -d`, also in production) asks the app once a minute whether a search is due, and the app runs it once on the chosen days after the chosen time.

1. `.env.local` on the server: `HASDATA_API_KEY`, `HASDATA_INDEED_DOMAIN=ca`, and `BUSINESS_TIMEZONE` set to the client's zone (`America/Toronto`), so the time below is their local time. `.env` must have `JOBS_KEY`, which the production steps create.
2. Check that the `jobs` container is up: `docker compose -f compose.yaml -f compose.prod.yaml ps`.
3. As an administrator: Settings → Lead searches, tick Monday only, set the time (06:00), keep Indeed as the source, set the listings cap, save. Under Job listing sources, Indeed must be enabled with a budget.
4. Leads → Searches & runs: add the searches (a group of job titles, one location, and how many days back to look; new searches are pre-filled from Settings → Lead searches) and keep them active. Click **Run searches now** once to confirm the key and budget; the result and any HasData error show under Recent runs.

Every run also appears in the container log, `docker compose -f compose.yaml -f compose.prod.yaml logs --since 24h jobs`. If you would rather use the operating system's scheduler (Windows Task Scheduler, cron), stop the `jobs` container and post to the app instead, as often as once a minute or once an hour; the app still runs each search only once per day:

```
curl -X POST -H "X-Jobs-Key: <JOBS_KEY from .env>" -H "Content-Type: application/json" -d "{}" http://localhost:3000/api/jobs/run
```

### Insights (analytics)

**Insights** (the former Reports & dashboard) opens with the period's totals, activity over time, and the performance table with its drill-downs and Excel, PDF, and CSV exports. For administrators the **Team board** follows: one row per salesperson as things stand now (active deals, overdue follow-ups, stalled deals, client replies waiting, this week's calls, emails and visits, deals created, last active), the people with the most waiting on them first; every number opens the deals behind it, from where a manager can comment on the deal's Collaboration tab, assign a task, or reassign it. Below it the analytics add, for the chosen period and filters: the pipeline by status now (click a number or bar for the deals), the pipeline at the end of each day, week, or month of the period, the movement between statuses with the cold → warm → hot → client funnel and the moves backwards, lost and disqualified reasons, the median time a deal spends in each status, a Stalled deals list that says why each deal needs attention (longer in its status or quiet for longer than the needs-attention rules allow, follow-up overdue, a hot deal gone quiet), the leads inbox funnel per run and by job type, breakdowns by industry, city, and deal source, the clients worked most, and a leaderboard per salesperson. Periods: last 24 hours, 7, 30, or 90 days, 12 months, the calendar periods, or a custom range. Filters: salesperson, status, deal source (Road Trip, Cold Call, Cold Email, Office, Referral; it was called deal type until November 16, 2026), city, industry, client name, origin (from the leads inbox, or by hand or from a trip), and job type. The needs-attention rules under Settings double as the days allowed per status. Sales Managers see their own numbers; administrators see everyone. A weekly stalled-leads email to administrators exists behind the Send report emails switch, off by default.

### Leads inbox

**Leads** in the navigation is a shared list of companies that are hiring, built from keyword searches on the configured job-listing sources (Adzuna, JSearch, Indeed through HasData, a custom JSON source, or the sample source). Administrators keep the searches under **Leads → Searches & runs** (name, a group of up to ten job titles, one location, the posted-within window in days, job type, an optional cap of listings per source) and the schedule under **Settings → Lead searches** (days of the week, time, the default cap, the default titles, location, and window pre-filled on new searches, notifications); Indeed accepts one keyword per call, so a search's titles go out as one query (`"forklift operator" OR "machine operator"`), and one search covers the whole group at the cost of one call per page; the `jobs` service runs them, and **Run searches now** starts a run on demand. The sources that answer the searches are chosen under Settings → Lead searches (Indeed through HasData by default) and must also be enabled, with budget left, under Job listing sources, so two or three runs a week with a cap of a few hundred listings keep the Indeed calls inside the free credits.

Each run groups the listings by company into one card. From a card's **Actions** menu, a salesperson clicks **Convert to Deal** and picks the pipeline stage, the status and the owner (themselves by default); the deal is created in that owner's name from the lead's details, linked to the card, and the card leaves the Inbox: the deal is in the Pipeline at the stage and status chosen (since November 20, 2026 Leads and Lead Generation have no Converted or Existing deals tab). **Not relevant** hides a card with a reason from the List of values; a role-level reason ("Role not relevant") lets the company come back when a different role appears, a company-level reason keeps it hidden. A company that is already a live deal or client never enters the inbox: its new listings go to that deal's timeline (marked as system entries that do not count as sales activity) and the owner is notified. A company whose earlier deal was closed or archived comes back with that history, and **Reopen deal** restores the old deal for the chosen owner instead of creating a second one. Salespeople get a notification when a run adds new companies, and the Leads item shows how many wait in the inbox; **Back to the inbox** returns a card marked not relevant.

**Cards from the sales tracker.** The tracker import (Administration → Tracker import, or `npm run remote -- import`) puts every company whose sheet rows name no Sales Manager in the inbox instead of giving it to a default owner. The card is marked "Sales tracker", shows the sheet's status, contact, and its rows as tracker entries, and **Convert to deal** opens the deal form filled with everything the sheet knew (status, city, contact, emails, positions, first-contact date), creates the deal for the chosen owner, and writes those rows to its timeline in the owner's name, so the next import recognises them. A later export that names a Sales Manager for the company turns the card into that deal; rows removed from the sheet rebuild the card, and a company gone from the sheet loses it. The import's owner choice ("Companies whose rows name no Sales Manager") can still send them to one person.


## Remote administration with API tokens

Every API the app has can be called from another machine with a personal access token, so user management, list values, settings, targets, the audit log, deals, and the tracker import need no access to the server. An administrator creates a token under **Administration → API access** (a name and an expiry of 30, 90, or 365 days, or never) and copies it once; the app stores only a hash. The token acts as that administrator, with their privileges at the time of each request, so terminating the account or revoking the token on the same page stops it at once. A token cannot create other tokens. Needs migration 16 (November 10, 2026).

Two more things are part of the same API, so the server needs no shell either (both since November 12, 2026; releases also have a screen, Settings → Releases, since November 13, 2026):

- **Data corrections.** `npm run remote -- sql "<statement>"` sends one SELECT, INSERT, UPDATE, or DELETE to `POST /api/admin/sql`. Without `--apply` the statement runs and is rolled back, so the row count shows what would change; with `--apply` it is kept. It runs as the app's database role (rows only, the tables themselves cannot be changed), stops after 30 seconds, and every call, including a refused one, is in the audit log with its text. Use it for a correction on many rows that the app has no screen for; changes that should also reach other installations belong in a migration. `ADMIN_SQL=off` in `.env.local` switches the endpoint off.
- **Releases.** On a server started from `compose.prod.yaml` a push to the followed branch deploys itself (see [Production](#production)). `npm run remote -- deploy-status` shows the commit and schema version the server runs, whether its deployer is alive, and the last ten deploys; `--log` adds the end of the output of the last failed one. `npm run remote -- deploy` asks for a rebuild and restart now and waits for the result, for a change in the server's `.env.local` or to retry a failed commit. To push without releasing, pause deploys first: Settings → Releases in the app, or `npm run remote -- deploy-pause`; the pushed version then waits until `git push origin master:release` (no token needed), `npm run remote -- deploy` or **Deploy now** in the app, and `deploy-resume` lets pushes go live by themselves again.

Send the token as a bearer header to any endpoint listed in [docs/SPEC.md §6](docs/SPEC.md):

```bash
curl -H "Authorization: Bearer ltp_…" https://leadtrail.pro/api/users
```

Or use the bundled client from a checkout of the project (Node 22 and `npm ci`; nothing from the server is needed). Copy `.env.remote.local.example` to `.env.remote.local` (git-ignored) with the address and the token, then:

```bash
npm run remote -- whoami
npm run remote -- get /api/users
npm run remote -- patch /api/users/7 '{"active":false}'
npm run remote -- post /api/list-values '{"listKey":"city","value":"Guelph"}'
npm run remote -- import-status
npm run remote -- import "docs/Sales Leads 2026.xlsx"            # preview: nothing is written
npm run remote -- import "docs/Sales Leads 2026.xlsx" --apply    # same options as the script: --baseline, --owner "Name=email", --default-owner, --sheet, --keep-action-names, --force
```

The preview and the report are the same as the command-line script's, and the report is saved as `import-report.txt`. A request that carries a token skips the browser origin check, because browsers never send that header on their own; privileges, validation, and the audit log are the same as in the browser.

## Production

The steps alone are in [docs/SETUP.md](docs/SETUP.md): part B for the first install, part C for releasing a change (push, Deploy now, check, undo).

`compose.prod.yaml` overrides the development stack with a standalone Next.js image (about 460 MB), no bind mounts, uploads in the `attachments` volume, and PostgreSQL not published on the host, and adds the `migrate` and `deployer` services described below.

The full server walk-through, including the reverse proxy and the first sign-in, is [docs/TESTING.md, path C](docs/TESTING.md#c-server).

- The app container takes its configuration from `.env.local`. Behind a reverse proxy, set `APP_URL` to the public origin and terminate TLS at the proxy.
- Accounts: the setup step creates every account in `seed/accounts.csv` that is missing. To add people later, add rows, commit, `git pull` on the server, and run `docker compose -f compose.yaml -f compose.prod.yaml run --rm setup node scripts/seed-users.mjs`; or add them under User management in the app. Nothing is needed in the Google Cloud console: the consent screen is published, so any Google address the app knows can sign in.
- **Releases need no commands on the server after the first start.** `up -d --build` also starts two helpers. `migrate` upgrades the database every time the stack comes up and the app starts only after it succeeded, so there is no separate schema command. `deployer` checks the repository's branch every minute; when it has moved (a push), or when an administrator asks (`npm run remote -- deploy`), it updates a clone of its own, rebuilds the images, lets `migrate` run, and restarts the app and the scheduler, usually within a few minutes. A commit that does not build or whose database upgrade fails leaves the running app in place, is recorded as failed with the reason (`npm run remote -- deploy-status --log`), and is not tried again until the branch moves or a deploy is asked for. Optional lines in `.env`: `DEPLOY_BRANCH` (default `master`), `DEPLOY_REPO` (default: the origin of this folder), `DEPLOY_GIT_TOKEN` (a read-only token, needed once the repository is private), `DEPLOY_AUTO=off` (deploy only when asked), `DEPLOY_INTERVAL_SECONDS` (60). Three things to know: whoever can push to the branch decides what runs on the server; the deployer builds from its own clone, so this folder stays at the commit of the last manual pull and only supplies `.env`, `.env.local`, and the repository address; and a change to the `deployer` service's own lines in `compose.prod.yaml` still needs one manual `up -d --build`. The deployer drives Docker through `/var/run/docker.sock`; it was rehearsed on macOS and has run on the Windows server (Docker Desktop) since November 13, 2026, where it deployed its first push by itself.
- The image carries the database scripts, so a schema upgrade can also be run by hand from it with the command below; the `migrate` service already does this on every start, so by hand it is needed only to upgrade without a restart. The recent migrations (44 in all): 38 to 41 of November 19, 2026 (the Lead Gen Tool deal source; a lead's Lead source, BD action, Client response, note and who added it, with the deals' values copied into their comments; a lead's company and contacts; the Closed Date of existing clients), 42 to 44 of November 20, 2026 (archived leads and the days after which a not relevant lead is archived; favourite deals; the approval queue's working days), 30 to 37 of November 18, 2026 (the Archival reason list and `leads.archive_reason_id`; the Sales Trips tables `visit_trips` and `visit_trip_deals`, and the Recent Planned Trips number in List of values; the planner's Max Radius (km) and Number of Results (max); the Activity Outcome list and `tasks.outcome_id`; the activity note and `task_attachments`; an activity's company and person; several people and several team members on an activity), 27 to 29 of November 16, 2026 (every contact belongs to a company; Referral added to the deal sources; a type and an end time on tasks), 22 to 26 of November 13, 2026 (the new names for two seeded values, contacts as records, deal value and expected close date, notes on contacts, several pipelines), 21 of November 12, 2026 (the To Do lists), 20 of November 12, 2026 (the deals of the sales tracker import credited to their Sales Managers instead of the administrator who ran it), 19 of November 12, 2026 (the needs-attention days per stage), 18 of November 11, 2026 (the pipeline stages, every deal placed), 17 of November 10, 2026 (the tracker draft on leads inbox cards), 16 of November 10, 2026 (the API tokens table), 14 and 15 of November 7, 2026 (the mailbox-watch table and columns; the job-title groups and posted-within window on lead searches), and 13 of November 6, 2026 (the Google Maps usage counters):

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
                         (leads = the deals, opportunities = the leads inbox, contacts = people and companies, pipeline = board, stages and pipelines, tasks = Activities, visit-trips = Sales Trips, trips = the Sales Trip Planner,
                         reports and analytics = Insights, deploy = releases)
src/lib/                 database pool, dates and timezone, HTTP helpers, mailer, async-data hook
scripts/                 create-database.mjs (migrations), create-app-user.mjs, seed-users.mjs (+ lib/seed-accounts.mjs), seed-sample-data.mjs, import-tracker.mjs (+ lib/tracker-import.mjs, the rules shared with the upload page,
                         and lib/tracker-mapping.mjs), ltp.mjs (remote administration client, `npm run remote`), deployer.mjs (the server's deployer, with lib/deploy-plan.mjs), lib/contacts-sync.mjs (keeps deals and their contacts in step), jobs.mjs (the scheduler), db-check.mjs (connection diagnosis), mail-test.mjs (SMTP check), jobs-test.mjs and maps-test.mjs (live key checks), docker-entrypoint.sh (dev container), e2e.sh (browser suite runner)
seed/accounts.csv        the accounts that may sign in (see Seed accounts)
tests/unit/              node:test unit suites, no database needed
tests/e2e/               Selenium end-to-end suite (node:test) with helpers/ui.mjs and helpers/data.mjs
docs/                    PRD.md (requirements with IDs and status), SPEC.md (design, API, data model, screens), TESTING.md (set up and test on a laptop or a server),
                         Sales_Tracker_App_BRD_SRS_Updated.pdf (the updated BRD/SRS; its new section 25 is tracked as OPP-01..22 in PRD.md)
Dockerfile               targets: dev (hot reload), runner (standalone production image), and deployer
compose.yaml             db, app, jobs (digest, KPI report, lead-search, and mailbox-watch scheduler), setup, and the `test` profile (db-test, app-test, selenium, e2e)
compose.prod.yaml        production override, with the migrate and deployer services
```

## What is implemented

- **New layout and names (step 1).** Menu: Action center, Pipeline (the deals), Leads, Contacts, Activities, Insights, then To Do, the planners, and administration; the top bar carries the page title, the search over all deals, and a "+" that adds a deal or an activity from any page. **Deals** is one page with a view switch (board, list, archive, approval queue). A **deal opens as a page** (`#/deal/<id>`): Summary, Person, Company and Overview panels on the left; the composer (note, call, email, visit, follow-up), Focus (open tasks, next follow-up) and History (timeline with filters, collaboration, emails, documents, profiles, audit) on the right; Back returns to the list or board as it was. The add-deal dialog shows the deal on the left and the person and company on the right. **Contacts** lists People and Companies. They are records of their own (migration 23): add a person or a company before any deal, open its page (details, people, deals, history) and start a deal from it with "+ Deal"; a company can have several deals, and editing a contact changes what its deals show. A deal can carry an optional **value** and **expected close date** (shown on its card and summed per stage once filled). A contact's page takes **notes and logged calls** of its own, duplicates are **merged**, and **Contacts → Timeline** shows who was contacted in each of the last twelve months. **Several pipelines** can be set up under List of values → Pipeline stage; the board's picker appears with the second one (SPEC §10.13–§10.18, PRD §3.26). Since November 16, 2026 (SPEC §10.19, PRD §3.27):
  - The menu says **Pipeline**, and "Person" reads **Contact**. A contact always belongs to a company.
  - Add deal starts by picking the company (its open deals are shown), then one of its contacts. A new company or contact is created only after **Create and add deal**.
  - A deal's emails come from every contact of its company, in the composer's **Emails** tab, which also has **Log an email by hand**.
  - The board fills the window. Each card's ⋯ menu adds a follow-up, puts the deal on a To Do list, converts it to a client or archives it (with an Archival reason); since November 18, 2026 cards move by dragging only.
  - A **date filter** (created or follow-up date) and a **board by status** (drag to change the status) are added.
  - Sales Managers and Admins use **Edit pipeline** to rename, add, reorder and delete stages.
- **Roles and privileges.** Three system roles (Admin, Sales Manager, Recruiter) with renamable display names. Each role has default privileges; administrators can grant extras per account. Since November 6, 2026 every Sales Manager may also reassign any deal, so a colleague's deals can be handed over while they are away; every move stays in the audit history.
- **Leads inbox.** Scheduled searches (a group of job titles sent as one Indeed query, one location, a posted-within window) on the job-listing sources produce one card per hiring company under **Leads**; salespeople assign a card to themselves or a colleague, which creates the deal pre-filled, or mark it not relevant with a reason. Companies that are already deals or clients get their new listings on the deal's timeline instead, and the tracker import parks companies without a Sales Manager here with their history. See [Leads inbox](#leads-inbox).
- **Duplicate guard.** A new deal that matches an existing one on client email, website, phone number, or company name is refused with a link to that deal; a very similar name at the same address, or a match on an archived deal, warns and can be overridden.
- **Sign-in and security.** Sign in with Google only, with identity, read-only Gmail, and sending granted in one consent; no passwords are stored. Database-backed login history, per-account daily auto sign-out at a configurable time, and rate limiting. On a stack without a Google client (the browser suite) the email-and-password sign-in with scrypt hashes, two-factor codes, and reset links remains available.
- **Deals board.** One column per stage (New Deal, Contact Made, Qualified, Profile Shared, Meeting Completed, Negotiations started, Contract Signed) and a card per active deal until it becomes a client or is closed, with its status tag, owner, last BD action, next step (earliest open task or follow-up date) and a quiet marker when the deal is past its needs-attention limit. Drag a card to another stage (the ⋯ menu on the card offered the stages too until November 18, 2026); every move goes on the timeline and can be undone. Each BD action belongs to a stage (List of values → BD action), so recording an action from a later stage moves the deal forward, and Recompute stages places every deal again after the mapping changes. After a logged call, email, or visit, a BD action, or a move, the app asks "What's next?" pre-filled with the stage's suggested step (Settings → Pipeline next steps; a call one business day after Contact Made, for example), and an administrator can have that task created automatically instead. Needs-attention rules can be set per stage, and the Action Center and the daily digest list deals with no next step. The deal page shows the stages as a bar (click one to move the deal), the lists move several deals to a stage at once, and Insights adds the pipeline by stage with a drill-down, stage over time and time in stage; the KPI emails carry the pipeline by stage.
- **Deals.** All BRD section 6 fields plus the status reasons from the October 2026 change note (Lost and Disqualified ask for a reason and display as “Status – Reason” everywhere), owner as a user reference, creator becomes owner, transfer and administrator reassignment (open tasks follow the deal), bulk archive, restore, and reassign, independent archive search, and queued deals for historical first-contact dates with approve and reject.
- **Timeline.** Logged calls, emails, visits, and interaction notes, plus automatic entries for status, BD action, client response, follow-up, transfer, state, task, and file events. Most recently active deals sort first.
- **Collaboration.** A Collaboration tab on every deal with threads and one level of replies, rich text, @mentions of people and groups (in-app and email notifications), quotes, edits by the author, references to the deal's documents and profiles, and soft delete by administrators with the original kept in the audit log; tasks take comments the same way. The thread refreshes every 20 seconds while open.
- **To Do lists.** Lists an administrator defines under List of values → To Do list ("To be visited" first). A deal is on one list at a time, moved on and off by hand from the deal page's Summary or for a selection in any deal list; the To Do page shows the deals per list, longest waiting first, with counts on the tabs and in the menu (migration 21, November 12, 2026).
- **Sales Trips.** Deals on To Do → To be visited are put on a trip with a title, a date and a salesperson (managers choose; others plan their own), and leave the list. The Sales Trips page lists those trips and the Sales Trip Planner's together: upcoming first, My Trips / Everyone, user, a By Period calendar (a day or a range), and a search on the trip title and its deals' company, contact, city and address (a planner trip's address and companies too). A trip's page lists its deals in order; deals are added from To be visited or taken off (back to the list they came from), and the trip is edited or deleted, choosing whether its deals go back to To Do, stay in the Pipeline only, or are archived with an Archival reason (migration 31, SPEC §10.21).
- **Emails (Gmail).** Each user can link their Gmail account; a deal's Emails tab lists recent messages to or from the deal's client addresses with direction, sender, recipients, subject, time, and body text. Administrators see every connected mailbox, and a colleague helping on a deal sees the thread from whichever connected mailbox the mailbox watch matched to it. The mailbox watch scans the connected mailboxes every five minutes, stamps each deal with the client's last email, flags deals awaiting a reply, and notifies the owner. Dormant until a Google OAuth client is configured.
- **Search and filters.** Keyword search across deal fields and notes; filters for deal source, status and status reason, category, size, city, owner, client response, BD action, and date ranges; sortable, paginated lists.
- **Activities (tasks).** Tasks with deal, assignee, due date and time, priority, description, and checklist. Due dates can be typed in words (“next Monday at 10am”, “in two weeks”, “Feb 1”, “January”) and are shown for confirmation before saving; month names and relative periods skip weekends and business-calendar holidays. Follow-ups scheduled from a deal set the follow-up date and create a reminder task, and a note that mentions a next step with a date (“follow up next week”, “send the proposal by Friday”) offers to create that task when the note is saved.
- **Sales trip planner.** Define a trip by title, address, radius in kilometres or driving minutes, business type, and number of results (up to 50); the companies found are listed with address, distance, a hiring count that opens the job listings, and an Action computed by matching each company against existing deals and clients (website domain, phone, name, address) and shown as the deal's status, including “Lost Lead – reason” and “Disqualified – reason”. Sort any column, filter by Action, shortlist, set planned visit dates, export to Excel, or print the field-visit report. Sample data by default; live providers plug in behind a small interface. Google calls are metered per month against budgets under Settings → Google Maps usage, with a live usage card on the planner pages and administrator alerts at 80% and 100%. The job-listing sources behind the Hiring column are metered the same way, with HasData's live credit balance.
- **Files.** Documents and a separate Resumes/Profiles Shared area, with in-app preview for PDF, images, text, and Word files, version numbers for re-uploads, and administrator soft delete.
- **Notifications and digests.** A bell in the top bar collects task assignments and changes, deal status changes, transfers, queued-deal events, file uploads, and client emails found by the mailbox watch, with unread counts and one-click navigation. Every Sales Manager and Admin gets a daily digest (overdue and upcoming follow-ups, tasks, deals needing attention, yesterday's counts) and a weekly digest (last week's numbers, targets, team totals for admins), in-app and by email; each person chooses what they receive, and administrators set the schedule or send one at once. Administrators also get the daily, weekly, and monthly KPI report emails (see the KPI reports paragraph under [Configuration](#configuration-envlocal)).
- **Action center.** Calls, emails, and visits this week versus last week, overdue, today, and tomorrow follow-ups, target progress, deals that have gone quiet for longer than their limit (a default number of days plus Admin rules per status and BD action), open tasks, recent deals, and client replies waiting for an answer.
- **Targets and reports.** Target templates per productivity stage, assignment per person, and reports for today, yesterday (business day), this week, last week, month to date, last month, and year to date with drill-down to the underlying records and Excel, PDF, or CSV export. Team reports filter by person, productivity stage, and target template. Tool-engagement counts (logins, updates, tasks, files) are included. Administrators also get the Team board on Insights: per salesperson, active deals, overdue follow-ups, stalled deals, client replies waiting, this week's activity, and last active, each number opening the deals behind it.
- **Administration.** User management with terminate-and-reassign, list-of-values management with rename that flows through to existing deals, target templates, settings (role names, reminder days, and the business calendar of public holidays), the sales-tracker import page (upload the sheet export, preview the exact outcome, apply), personal access tokens for administering the app from another machine (see [Remote administration](#remote-administration-with-api-tokens)), and Settings → Releases (the version the server runs, Pause deploys, Deploy now).
- **Audit.** Every create, update, transfer, approval, archive, file, task, user, value, and settings change is recorded with actor, time, and before/after values. Deal history is shown on the deal for administrators.

## Not yet connected

Forwarding emails from the app (sending and replying are built), AI summaries, OCR of business cards, presence and typing indicators on collaboration threads, mobile push notifications, device authorization, and review data (the sales trip planner searches Google Maps once `MAPS_API_KEY` is set and shows sample companies with `TRIPS_PROVIDER=stub`; hiring data comes from the configured job sources). Lead generation and the road visit planner show sample content. Designs for these are in SPEC.md section 10. The Pipeline board (SPEC.md §10.11, PRD §3.24) is complete through its third phase. Deal values and several pipelines were added on November 13, 2026 (SPEC.md §10.15, §10.18); stage-to-stage conversion rates and probabilities per stage are not built. Of the new base (SPEC.md §10.13) these are still to come: Insights dashboards, activities with types and a calendar, custom fields, saved filters, and a column chooser for the lists; files, tasks, and an owner change on a contact itself are not built either (§10.14). From the comments of November 16, 2026 (SPEC.md §10.19), these were left out: adding a stage between two columns, dragging columns, and earlier company names in the add-deal list.

## Checks and tests

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit     # 26 files in tests/unit: date parser, status reasons, trip matching and the Google trip adapter, reminder rules (status, BD action, stage), digest schedule, KPI reports, analytics, rich text, mentions, Google sign-in, seed accounts, tracker import and mapping rules, job sources, search mappers and usage meter, Maps usage meter, mailbox watch, leads inbox, To Do, API tokens, pipeline stage, next-step and several-pipelines rules, contacts (keys, input rules, timeline months), deal value, deploy decisions including the pause (node:test, 185 tests, no database needed)
```

Inside Docker, prefix each with `docker compose exec app`.

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `master` and every pull request: typecheck, lint, and the unit tests on Node 22, then the browser suite through `scripts/e2e.sh` on the GitHub runner's Docker. Screenshots of failed browser tests are attached to the run as the `e2e-failures` artifact.

As of October 31, 2026 the checks job passes but the browser job fails on every run (its logs have not been examined yet), so the browser suite is verified locally with `scripts/e2e.sh`, where all 54 tests passed on October 31, 2026 all 73 tests in nine files on November 12, 2026, after the Pipeline board, and all 98 tests in twelve files on November 16, 2026 after the comments of that day (SPEC §10.19), then all 101 that night after the second comments file (§10.20) and the suggestion lists in Add deal. The repository moved to `github.com/heypankajp/leadtrailpro` with the rename; the old address redirects.

### Browser end-to-end tests (Selenium)

`scripts/e2e.sh` runs the suite in `tests/e2e/` entirely in Docker (compose profile `test`): a production build of the app with a fresh schema, a throwaway PostgreSQL kept in memory, a Selenium Chromium grid, and the test runner. Nothing is needed on the host besides Docker. A full run of the 93 tests in 12 files takes about ten minutes including container start; stop the development `app` and `jobs` containers first (`docker compose stop app jobs`), because on a busy machine the suite produces timeouts that are not failures of the app.

```bash
scripts/e2e.sh                               # whole suite
scripts/e2e.sh tests/e2e/02-leads.test.mjs   # one or more files
```

| File | Covers |
|---|---|
| `01-auth.test.mjs` | Sign-in screen, first administrator via the setup link, sign out, wrong password, password reset request accepted in stub mail mode, password change and re-login |
| `02-leads.test.mjs` | Create a deal, BD action, call and note on the timeline, a note that offers and creates a follow-up task, a rich-text Collaboration message with a mention, a quoted reply, an edit and a removal, the Emails tab of the composer without Gmail configured (with Log an email by hand), follow-up that becomes a task, document upload, edit, status change, Disqualified with a reason, list and global search, archive and restore; the "What's next?" prompt after the BD action and the logged call is skipped; the old `#/warm` address, the search from the top bar, and Contacts (the pages of the deal's contact and company, which open the deal; Back returns step by step). A new company and contact are confirmed before the deal is saved |
| `03-tasks.test.mjs` | Create a task linked to a deal, complete it, edit it, comment on it with a mention and edit and remove the comment, type a due date in words and confirm the resolved date |
| `04-team.test.mjs` | Create a Sales Manager, assign them a task, a per-account sign-out time ends a session started before it, role-limited navigation, the task shows in the notification bell, historical date queues a deal, admin approval, transfer, a mention reaching the Sales Manager as a notification, termination hand-off, terminated account cannot sign in |
| `05-admin-reports.test.mjs` | List of values, role rename reflected in the menu, Settings → Releases pausing and resuming automatic deploys, a needs-attention rule that shows on the Action Center, a set-password link read from the stub outbox and used to reset the password, the daily digest and the daily KPI report sent on demand, the job listing sources' status and a budget change that is kept, business-calendar holiday, target template, report drill-down, the Insights sections (Pipeline now, Stalled deals, Leaderboard, the Team board), stage filter, PDF and Excel export responses, action-center metric link; a BD action mapped to a pipeline stage and Recompute stages, a seventh needs-attention rule next to the six seeded stage rules, the next step a stage suggests under Settings → Pipeline next steps, the By stage, Stage over time, and Time in stage sections on Insights, an API token created and revoked, the Tracker import page |
| `06-trips.test.mjs` | Plan a sales trip on the stub provider, a deal recognised by website domain, job listings dialog, shortlist and planned visit, Show and Action filters, Excel export response, trip list |
| `07-accessibility.test.mjs` | axe-core WCAG 2.1 A/AA audit of the sign-in screen, Action Center, deal page (with its Timeline and Collaboration tabs), deal list, Activities, Insights, settings, list of values, user management, and trip planner; serious or critical findings fail |
| `08-opportunities.test.mjs` | Leads inbox: a search on the sample source, Run searches now, cards in the Inbox, Convert to deal with the pre-filled form and the Timeline entry, the open-deals notice when an existing company is typed in Add deal, Not relevant and Back to the inbox; a tracker import that places a company with no Sales Manager in the inbox, and its card converted into a deal that carries the sheet's history |
| `09-pipeline.test.mjs` | A new deal starts in New Deal and moves when its card is dragged, the undo bar, the "What's next?" prompt (skipped after a move, saved as a task after a BD action that advances the stage), the timeline's stage entry, the status filter on the board, the stage bar on the deal page with its confirmation, the Action Center's No next step panel, a bulk move of two deals from All deals, a deal value on the card and in the stage total; since November 16, 2026 the full-width board without the next-step mark, the date filter, the card menu's follow-up, To Do list and archive, the board by status (a drag to Lost asks for the reason, Undo returns it to Cold), and Edit pipeline (add, rename, move and delete a stage); since November 18, 2026 also archiving with an Archival reason, Convert to Client and the Clients page, the quarter entries and Quiet Deals, and Followup on the calendar |
| `10-todo.test.mjs` | A deal put on To be visited from its page with the timeline entry, the To Do page with the badge and the counts on the tab and in the sidebar, taking deals off with the bulk bar, a second list added under List of values, and a bulk move to it from All deals |
| `11-contacts.test.mjs` | Contacts first: a contact added with a new company (confirmed first) before any deal, a deal started from the contact with the form filled from it, the company's page with its contacts and deals, a second deal for the same company without the duplicate guard, an edit of the company reaching its deals, and a company without deals added and removed; a note on a contact with no deal, filing that contact under another company, merging a duplicate company with its contacts and notes, and the contacts timeline |
| `12-pipelines.test.mjs` | Several pipelines: no picker with one pipeline, a pipeline added under List of values with a stage name the default pipeline also uses, a deal added to it (the pipeline picked above the stage arrows) that shows on its board only, its own stage bar, and a move through its stages by dragging, the board showing only that pipeline's stages |
| `13-sales-trips.test.mjs` | Sales Trips: a deal on To be visited put on a new trip from To Do and taken off the list, the trip found on Sales Trips by a company on it and by its date (By Period), and deleting the trip with Move back to To Do returning the deal to To be visited |

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
docker compose run --rm app npm run mail:test      # the same for the legacy SMTP mailer only (add -- --send to deliver a test email); Gmail sending is checked under Settings → Email log
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
- **"Sign-in failed: these credentials are not valid or you are not registered"** after Sign in with Google: the Google email is not in the users table, or the account is deactivated. Add it under User management or to `seed/accounts.csv` and run the seed script.
- **Google shows `Error 400: redirect_uri_mismatch`**: `<APP_URL>/api/auth/google/callback` is not registered on the OAuth client (the match is exact, including http or https and the port). **`Error 403: access_denied`** or "has not completed the Google verification process": the consent screen has gone back to Testing and this account is not a test user; publish it again (Audience → Publish app) or add the account as a test user. **"Google hasn't verified this app"** on a first consent is expected: click Advanced and continue.
- **No "Sign in with Google" button** (the password form shows instead): `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing; `curl http://localhost:3000/api/auth/session` shows `"googleSignIn":false`.
- **"The Sales Trip Planner is not configured"**: no `MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) and no stub. Add the key to `.env.local`, or for sample companies put `TRIPS_PROVIDER=stub` in `.env` (Docker) or `.env.local` (without Docker). With the stub active the key is never used.
- **"The Google Maps monthly budget for … is spent"**: the planner stopped at the budget under Settings → Google Maps usage. Wait for the 1st of the month, raise the budget (usage beyond Google's free allowance is billed), or search with a radius in km, which makes no Routes call.
- **"Indeed via HasData: monthly call budget spent"**, or the job-source usage card says Stopped: the app stopped at the monthly budget under Settings → Job listing sources. Raise it if the account balance shown there has credits left, or wait for the 1st; the daily budget resets at midnight UTC.
- **No "Client wrote" badge and no reply notification**: the mailbox watch only sees mail in connected mailboxes (someone signed in with Google with the Gmail boxes ticked) and only from addresses saved on the deal. It runs every five minutes from the `jobs` container; its runs are listed in `job_runs` as `mailbox_watch` with counts in the details column, and the first scan of a mailbox is silent by design.
- **Port already in use**: set `APP_PORT` or `DB_PORT` in `.env` and run `docker compose up -d` again.
- **Everyone was signed out after a deploy**: expected once, when the rename of October 30, 2026 changed the cookie names.
- **The server still runs the old version after a push**: `npm run remote -- deploy-status` (or Settings → Releases) says why: deploys are paused (release with `git push origin master:release`, Deploy now or `npm run remote -- deploy`), the deployer is not running, or the commit failed (`deploy-status --log` shows the end of its output; the previous version keeps running).
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
