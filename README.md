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
