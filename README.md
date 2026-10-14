# SalesTrackPro

SalesTrackPro is a responsive Next.js sales workspace prototype based on the supplied BRD/SRS. It brings the sales-manager action center, lead pipeline, follow-ups, opportunity recommendations, road visit planning, lead generation, reporting, and administration into one interface.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prototype scope

The current app is a client-side prototype seeded with representative sample data. Lead creation, lead search and status filtering, historical-date queuing, queue approval/rejection, archive/restore, opportunity review, and the main navigation flows are interactive. Sample datasets reset on refresh.

Authentication, role-based server authorization, persistent storage, Gmail/Google Workspace, AI services, OCR, live job-board or company-data connections, notifications, and optimized route services are not connected. Screens that depend on those services identify their content as preview/sample data; they need corresponding backend APIs and authorized integrations before production use.

## Build and checks

```bash
npm run lint
npm run build
```
