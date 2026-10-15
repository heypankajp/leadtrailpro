# SalesTrackPro

SalesTrackPro is a responsive Next.js sales workspace prototype based on the supplied BRD/SRS. It brings the sales-manager action center, lead pipeline, follow-ups, opportunity recommendations, road visit planning, lead generation, reporting, and administration into one interface.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## MySQL setup

Copy `.env.setup.local.example` to `.env.setup.local` and enter your local MySQL administrator credentials. Keep this file private; it is ignored by Git.

Create the `salestrackpro` database, its leads table, and the initial sample records:

```bash
npm run db:create
npm run db:user:create
```

The setup command creates the database, leads, users, and session tables, and sample leads. The app-user command creates a restricted `salestrackpro_app` account and writes its generated runtime credentials and bootstrap key to `.env.local`. The app uses that restricted account to read and write leads, users, and sessions; `.env.local` is ignored by Git.

On first launch, choose **First time setup** on the sign-in screen and use the local `USER_MANAGEMENT_KEY` to create the first administrator account. Bootstrap-key user creation is disabled once the first account exists. Sign in with that account to manage additional users. Passwords are stored as scrypt hashes; session tokens are random, HTTP-only cookies, with only their SHA-256 hashes persisted in MySQL. Lead and user endpoints enforce session privileges, and state-changing requests require a same-origin `Origin` header.

## Prototype scope

Lead records, including queued and archived leads, persist in MySQL. Notes, follow-ups, and attachment file contents remain in browser memory and reset on refresh.

The sign-in attempt limiter is process-local and resets when the server restarts; deploy behind a shared rate limiter for multi-instance production. Notes, follow-ups, and attachment file contents remain in browser memory and reset on refresh. Gmail/Google Workspace, AI services, OCR, live job-board or company-data connections, notifications, and optimized route services are not connected.

## Build and checks

```bash
npm run lint
npm run build
```
The app uses representative sample data. Persistent storage, authentication and role enforcement, Gmail, AI, OCR, live job sources, and route optimization are not connected; those limitations are documented in README.md.
## Gmail integration

The lead overview shows recent emails exchanged with the lead's executive and alternate email addresses. Each user connects their own Gmail (read-only scope); administrators see emails from every connected mailbox.

1. In Google Cloud Console, enable the Gmail API and create an OAuth client (Web application) with the redirect URI `http://localhost:3000/api/gmail/callback`.
2. Add to `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY` (any long random string; encrypts stored refresh tokens) and optionally `GOOGLE_REDIRECT_URI`.
3. Run `npm run db:create` to add the `gmail_connections` table, then restart the dev server.
