# Setup

Three parts. Everything runs in Docker, so the commands are the same on Mac, Windows and Linux.

| Part | Who | How often |
|---|---|---|
| [A. Laptop](#a-laptop) | every developer | once per laptop |
| [B. Server](#b-server-first-install) | whoever has the server | once, at the first install |
| [C. Releasing a change](#c-releasing-a-change-deployments) | developers and administrators | every release, from a laptop or the app; **nobody logs in to the server** |

## What you need

- **Git** and **Docker** (Docker Desktop on Mac and Windows; Docker Engine with the Compose plugin on Linux). Nothing else is installed.
- **Your Google address in `seed/accounts.csv`**, with the administrator on the first row. People sign in with Google only, and only the addresses in that file (or added later under User Management) get in.
- **The shared settings** from the project owner (step A2). Ask for them; they are not in the repository.

On Windows use PowerShell (Git Bash for `scripts/e2e.sh`). If Docker answers "permission denied", open PowerShell as administrator. Run `git config --global core.autocrlf false` once before cloning.

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

## B. Server (first install)

Done once. After step 6 nobody types commands on the server again: releases are part C.

You need a host with Docker, a domain, and a reverse proxy with HTTPS in front of port 3000. Every command takes both compose files.

**1. Get the code** as in A1.

**2. Create `.env`** with two secrets, any long random text:

```
POSTGRES_PASSWORD=<long random text>
JOBS_KEY=<another long random text>
```

Once the repository is private, add `DEPLOY_GIT_TOKEN=<GitHub read-only token>` here too, or the server cannot fetch new releases.

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

This also starts the **deployer**, the helper that makes part C work without the server.

**6. Point the reverse proxy** at `localhost:3000` (Caddy: `<your domain> { reverse_proxy localhost:3000 }`), open the site and sign in with Google. After the first sign-in, pick the sending mailbox under Settings → Email delivery.

**Back up** the Docker volumes `postgres_data` (the database) and `attachments` (uploaded files).

## C. Releasing a change (deployments)

The server fetches new code from GitHub by itself. A release is one git command: push `master` and the `release` branch together. No API token and no click needed. Nobody logs in to the server.

```bash
git pull --rebase origin master
git push origin master master:release      # push and deploy
```

Whoever can push to the repository can release this way. Only `git push origin master` saves the work without releasing it, while deploys are paused.

```
your laptop ──git push──▶ GitHub, branch master ─────────────┐
            ──git push──▶ GitHub, branch release ──▶ deploy  │
                               │   the server's deployer looks every minute
                               ▼                             ▼
                  release moved? ──yes──▶ deploys the commit release points to
                               │ no
                  deploys paused? ──yes──▶ master waits for a release push or Deploy now
                               │ no
                               ▼
     build the new version ──▶ upgrade the database (migrations) ──▶ restart the app
     (about 3 to 5 minutes; the old version keeps running during the build)
```

> **Deploys are paused on leadtrail.pro** (since November 13, 2026). A push to `master` alone does **not** go live:
> it waits for step 3. Settings → Releases shows whether they are paused.

**1. Check before you push.** Whatever is on `master` is what the server will run.

```bash
docker compose run --rm --no-deps app sh -c "npx tsc --noEmit && npx eslint src scripts tests && node --test tests/unit/*.test.mjs"
docker compose stop app jobs && scripts/e2e.sh     # the browser suite, about 8 minutes
```

A database change is a **new entry at the end** of `scripts/create-database.mjs`, with the next version number. Never edit an entry the server has already run: its number is at or below the "database version" under Settings → Releases.

**2. Push**

```bash
git pull --rebase origin master
git push origin master
```

**3. Release it**, any one of these:

- **From a laptop, with git only:** `git push origin master:release` (or push both at once as above). The server starts within a minute and the release takes 3 to 5 minutes. No token needed.
- **In the app** (an administrator): Settings → Releases → **Deploy now**.
- **From a laptop with the remote client** (an administrator): `npm run remote -- deploy`. It waits and prints the result. (Set up the remote client once: see below.)

The `release` branch is a pointer, not a place to work: never commit on it. Each push that moves it releases the commit it points to once. Pushing it again unchanged does nothing.

**4. Check it is live.** Settings → Releases → **Running** shows the commit (compare with `git log -1 --format=%h`) and the database version. From a laptop with the remote client: `npm run remote -- deploy-status`.

**If a release fails,** the previous version keeps running. Settings → Releases → **Last deploy** names the step that failed; `npm run remote -- deploy-status --log` prints the output. Fix it, then push `master` and `release` again (or press Deploy now). A failed commit is not tried again by itself.

**To undo a release,** run `git revert <commit>`, push `master` and `release`. A revert does not undo database changes. Fix data with `npm run remote -- sql "<statement>"`: it shows the rows it would change, and changes them only with `--apply`.

**Pause or resume:** Settings → Releases → **Pause deploys** / **Resume automatic deploys** (or `npm run remote -- deploy-pause` / `deploy-resume`). While deploys are on, every push to `master` goes live within a few minutes, with no click.

### The remote client (once per laptop)

`npm run remote` runs releases and data fixes against the live server from your laptop.

1. In the app, as an administrator: **API Access → Create token**. Copy the token: it is shown only once.
2. In the project folder, copy `.env.remote.local.example` to `.env.remote.local` and fill it in:

   ```
   LTP_URL=https://leadtrail.pro
   LTP_TOKEN=<the token>
   ```

   The file is git-ignored. Never commit or share it: the token acts as you.
3. Run commands with Node 22 or later (`npm run remote -- deploy-status`), or through Docker without Node:

   ```bash
   docker compose run --rm --no-deps app npm run remote -- deploy-status
   ```

### What still needs someone on the server (rare)

- Changing a setting or key in `.env` or `.env.local`. Then press Deploy now, so the app restarts with it.
- A change to the `deployer` service's own lines in `compose.prod.yaml`: one `docker compose -f compose.yaml -f compose.prod.yaml up -d --build`.

## If something fails

- On a laptop, `docker compose logs app` shows the reason in most cases; `npm run db:check` (above) explains a database connection that does not work.
- On the server, start with Settings → Releases and `npm run remote -- deploy-status --log` (part C).
- The long walk-through, with what to click and what each message means: [TESTING.md](TESTING.md). Every setting of `.env.local`: [README, Configuration](../README.md#configuration-envlocal).
