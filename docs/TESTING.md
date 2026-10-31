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

   Expected ending: ten `Applied migration …` lines, `The leadtrailpro schema is ready`, and `Created the restricted app role leadtrailpro_app and the user-management key in the ignored .env.local.`

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

5. Open [http://localhost:3000](http://localhost:3000). The sign-in screen offers **First time setup**: paste `USER_MANAGEMENT_KEY` from `.env.local` (`grep USER_MANAGEMENT_KEY .env.local`) and create the administrator. The option disappears once an account exists. Before that, `curl http://localhost:3000/api/auth/session` answers `{"user":null,"needsSetup":true}`.

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
   npm run db:check
   npm run dev              # http://localhost:3000
   ```

3. First-time setup, sample data (`npm run db:seed`), and the demo accounts are the same as in path A.

Extras on this path: `TRIPS_PROVIDER=stub` in `.env.local` gives the Sales Trip Planner sample companies (the Docker stack sets it for you); the digest scheduler is `npm run jobs` with the same `JOBS_KEY` in `.env.local` and in its environment.

## C. Server

Tested shape: a Linux host with Docker Engine and the Compose plugin, the app on port 3000 behind a reverse proxy that terminates TLS. The database is not published on the host at all.

1. Clone and create `.env` with the two required secrets (any long random strings) and the optional sample-data switch:

   ```bash
   git clone https://github.com/heypankajp/leadtrailpro.git && cd leadtrailpro
   cat > .env <<EOT
   POSTGRES_PASSWORD=$(openssl rand -base64 36)
   JOBS_KEY=$(openssl rand -base64 36)
   TRIPS_PROVIDER=stub
   EOT
   ```

   On a server `TRIPS_PROVIDER` must be in `.env`, not `.env.local`: compose passes it to the container and an empty value there means "use the real providers".

2. Create the schema, the app role, and `.env.local`:

   ```bash
   docker compose -f compose.yaml -f compose.prod.yaml run --rm setup
   ```

3. Edit `.env.local`: set `APP_URL` to the address users will type (`https://sales.example.com`; for a plain-http test host `http://<host>:3000`, which also makes the session cookie work without TLS), and either keep `MAIL_PROVIDER=stub` or fill in the `SMTP_*` lines (`docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run mail:test -- --send` checks them).

4. Build, start, check, and watch:

   ```bash
   docker compose -f compose.yaml -f compose.prod.yaml up -d --build
   docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run db:check
   docker compose -f compose.yaml -f compose.prod.yaml logs -f app
   ```

5. Put a reverse proxy in front that forwards `X-Forwarded-Host` and `X-Forwarded-Proto` (Caddy: `sales.example.com { reverse_proxy localhost:3000 }`), open only 80 and 443 on the firewall, then do the first-time setup in the browser as in path A step 5. Sample data: `docker compose -f compose.yaml -f compose.prod.yaml run --rm setup node scripts/seed-sample-data.mjs`.

Later on the server:

- Upgrade: `git pull`, then `docker compose -f compose.yaml -f compose.prod.yaml build`, then the migrations from the new image, then `up -d`:

  ```bash
  docker compose -f compose.yaml -f compose.prod.yaml run --rm -e PGUSER=postgres -e PGPASSWORD=<POSTGRES_PASSWORD> app node scripts/create-database.mjs
  docker compose -f compose.yaml -f compose.prod.yaml up -d
  ```

- Backup: `docker compose -f compose.yaml -f compose.prod.yaml exec db pg_dump -U postgres leadtrailpro > leadtrailpro-$(date +%F).sql`, plus the `leadtrailpro_attachments` volume for uploads.
- Logs: `docker compose -f compose.yaml -f compose.prod.yaml logs --since 1h app jobs`.

## What to test in the app

Each line is a short path a tester can follow after the first administrator exists (sample data makes the lists fuller).

- **Action Center**: overdue and due-today follow-ups, open tasks, leads needing attention, targets.
- **Leads**: New lead; open it; log a BD action; write a note with a phrase like "call back next Tuesday" and accept the suggested follow-up task; upload a document; post a message with an @mention under Collaboration; change the status to Disqualified with a reason; archive and restore from the list.
- **Tasks**: complete a checklist item, comment on a task, mark all notifications read from the bell.
- **Reports**: change the period and filters, export CSV, Excel, and PDF.
- **Settings**: Email delivery shows every message the app "sent" in stub mode (use **Forgot password** on the sign-in screen and open the reset link from here); Business calendar, Needs-attention rules, Job sources.
- **User management**: add a user and send the set-password link; it appears under Email delivery in stub mode.
- **Sales trip planner**: plan a trip from an address on the sample provider, shortlist a company, export to Excel.
- **Digest**: Settings → "Send me today's digest" puts a digest in the outbox and the bell.

## Automated checks

Inside the dev container (`docker compose exec app …` while the stack runs, or `docker compose run --rm --no-deps app …`), or directly on a laptop from path B:

```bash
npm run typecheck
npm run lint
npm run test:unit     # 63 tests, no database needed
npm run build
```

Browser suite (Selenium in Docker, about ten minutes, 54 tests): `scripts/e2e.sh`, or one file with `scripts/e2e.sh tests/e2e/02-leads.test.mjs`. Watch it live at [http://localhost:7900](http://localhost:7900); failed tests leave screenshots and page sources in `tests/e2e/output/`. It uses its own throwaway database and never touches your data.

GitHub Actions runs the same checks on every push and pull request. As of October 31, 2026 the typecheck, lint, and unit-test job passes and the browser job fails on the GitHub runner on every run, while the same suite passes locally; the job's log on the Actions tab of the repository is the next thing to read.

## When PostgreSQL does not connect

Run `npm run db:check` where the app runs (`docker compose run --rm app npm run db:check` for the Docker stack, with `-f compose.yaml -f compose.prod.yaml` on a server). Its first line tells you which host, port, user, and database are being tried, and that alone resolves most cases; on failure it prints the cause and the fix. The full table of connection messages, the application messages, and the commands to run first are in the README under [Troubleshooting](../README.md#troubleshooting).

If the message is not in that table, send the full output of `npm run db:check` and of `docker compose logs --tail 100 db app` with your report.
