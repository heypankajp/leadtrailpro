# Setup

How to get LeadTrailPro running on a laptop (A) or on the server (B). Everything runs in Docker, so the commands are the same on Mac, Windows and Linux.

## What you need

- **Git** and **Docker** (Docker Desktop on Mac and Windows; Docker Engine with the Compose plugin on Linux). Nothing else is installed.
- **Your Google address in `seed/accounts.csv`**, with the administrator on the first row. People sign in with Google only, and only the addresses in that file (or added later under User Management) get in.
- **The shared settings** from the project owner (step A2). Ask for them; they are not in the repository.

On Windows use PowerShell. If Docker answers "permission denied", open PowerShell as administrator. Run `git config --global core.autocrlf false` once before cloning.

## A. Laptop

**1. Get the code**

```bash
git clone https://github.com/heypankajp/leadtrailpro.git
cd leadtrailpro
```

**2. Create `.env.local`** in that folder with the lines you were given:

```
BUSINESS_TIMEZONE=America/Toronto
MAIL_PROVIDER=stub
GOOGLE_CLIENT_ID=<from the project owner>
GOOGLE_CLIENT_SECRET=<from the project owner>
GMAIL_TOKEN_KEY=<any long random text of your own>
```

- `MAIL_PROVIDER=stub` keeps a laptop from sending real email; messages show under Settings → Email log.
- Optional, only if you need them, because they spend the owner's quota: `GOOGLE_MAPS_API_KEY` (Sales Trip Planner), `HASDATA_API_KEY` and `HASDATA_INDEED_DOMAIN=ca` (lead search).
- Do not add database lines. The next step writes them.

**3. Set up, once**

```bash
docker compose run --rm setup
```

This builds the image (a few minutes the first time), creates the database, adds the database lines to `.env.local` and creates the accounts of `seed/accounts.csv`.

**4. Start**

```bash
docker compose up -d
```

Open http://localhost:3000 and choose **Sign in with Google**. Keep the port: Google sign-in is registered for `localhost:3000`.

**5. Load data (optional)**

| What | How |
|---|---|
| Sample deals, contacts and activities | `docker compose run --rm setup node scripts/seed-sample-data.mjs` |
| The sales tracker (Excel) | In the app: Tracker Import → upload the workbook → Preview → Apply. The workbook is not in the repository; ask for it. |
| Leads from Indeed | In the app: Leads → Searches & runs. Needs the HasData key; every run spends credits. |

**Every day**

| Task | Command |
|---|---|
| Start / stop (data is kept) | `docker compose up -d` / `docker compose down` |
| See what the app says | `docker compose logs -f app` |
| After `git pull` | `docker compose run --rm setup node scripts/create-database.mjs`, then `docker compose up -d` |
| Check the database connection | `docker compose run --rm app npm run db:check` |

## B. Server

You need a host with Docker, a domain, and a reverse proxy with HTTPS in front of port 3000. Every command takes both compose files.

**1. Get the code** as in A1.

**2. Create `.env`** with two secrets, any long random text:

```
POSTGRES_PASSWORD=<long random text>
JOBS_KEY=<another long random text>
```

**3. Set up, once**

```bash
docker compose -f compose.yaml -f compose.prod.yaml run --rm setup
```

**4. Edit `.env.local`** (the step above created it) and add:

```
APP_URL=https://<your domain>
BUSINESS_TIMEZONE=America/Toronto
MAIL_PROVIDER=gmail
GOOGLE_CLIENT_ID=<from the project owner>
GOOGLE_CLIENT_SECRET=<from the project owner>
GMAIL_TOKEN_KEY=<any long random text; never change it afterwards>
GOOGLE_MAPS_API_KEY=<optional>
HASDATA_API_KEY=<optional>
HASDATA_INDEED_DOMAIN=ca
```

In the Google Cloud console, add `https://<your domain>/api/auth/google/callback` to the OAuth client's authorized redirect URIs.

**5. Build and start**

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml run --rm app npm run db:check
```

**6. Point the reverse proxy** at `localhost:3000` (Caddy: `<your domain> { reverse_proxy localhost:3000 }`), open the site and sign in with Google. After the first sign-in, pick the sending mailbox under Settings → Email delivery.

**After that, no commands on the server.** Every push to `master` is built and released by the server itself, database upgrades included. To hold releases back, pause them under Settings → Releases; a paused server waits until an administrator releases.

**Back up** the Docker volumes `postgres_data` (the database) and `attachments` (uploaded files).

## If something fails

- `docker compose logs app` shows the reason in most cases; `npm run db:check` (above) explains a database connection that does not work.
- The long walk-through, with what to click and what each message means: [TESTING.md](TESTING.md). Every setting of `.env.local`: [README, Configuration](../README.md#configuration-envlocal).
