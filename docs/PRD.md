# LeadTrailPro — Product Requirements Document (PRD)

| | |
|---|---|
| Source | `Sales_Tracker_App_BRD_SRS.docx`, version 1.0, dated October 13, 2026. The updated BRD/SRS (`docs/Sales_Tracker_App_BRD_SRS_Updated.pdf`, added October 19, 2026) was reconciled on October 22, 2026: its sections 1–24 and appendices A–C are the v1.0 text this PRD already covers, and it adds section 25, Opportunity Recommendation (§3.23, OPP-01..22). The change note `leadtrailpro_Sales_Trip_Planner_Requirement_Change.docx` (received October 21, 2026; the file stays local and untracked) is incorporated as §3.22 and LEAD-06/07 |
| PRD version | 1.16 — November 12, 2026 (early): Pipeline board Phase 2 built (PIPE-08..10 implemented). 1.15 — November 11, 2026 (night): Pipeline board Phase 1 built (PIPE-01..07 implemented, PIPE-11 in part; open question 16 answered). 1.14 — November 11, 2026: pipeline board and stages (§3.24, PIPE-01..13, open question 16) requested after the project owner's Pipedrive trial; planned, nothing built. 1.13 — November 6, 2026 (later that day): email through the Google app and no stored passwords (AUTH-04..06 off with Google sign-in, open question 2 decided); Send email from a lead (MAIL-02 partly); the Analytics screen with rolling and custom periods, filters, status charts, stalled leads, pool funnel, breakdowns, and leaderboard (RPT-02..04). 1.12 — November 6, 2026: Opportunity Recommendation built in the reduced form the project owner chose (§3.23 statuses, open question 14 decided); duplicate guard on lead creation (LEAD-01, open question 12); every Sales Manager may reassign any lead (OWN-03). 1.11 — November 5, 2026: AUTH-03 Sign in with Google implemented for pre-registered accounts only (AUTH-01 kept); seed accounts file for the administrator and role accounts; open question 3 updated. 1.10 — October 31, 2026: product renamed LeadTrailPro on October 30, 2026; Next.js 16.4.3 security release; open question 2 updated with the SMTP findings (ports reachable, Google requires an App Password) and the plan for one Google account; open question 9 notes Google Maps billing and the no-card alternatives reviewed. 1.9 — October 26, 2026: job-listing sources layer built (TRIP-06), open question 10 closed with the combined-source decision; Job Bank reviewed and dropped. 1.8 — October 25, 2026: job-listing source decided (Indeed through HasData, open question 10). 1.7 — October 25, 2026: rich text and dictation for notes (NOTE-03/04), task comments with mentions and file references (TASK-04, COLL-06), CI workflow. 1.6 — October 23, 2026: legacy tracker import built, defaults recorded in open question 13. 1.5 — October 22, 2026: collaboration threads with mentions, quotes, edits, and Admin removal (COLL-01..06), rich text for messages (NOTE-03 editor). 1.4 — October 22, 2026: in-app notifications, preferences, and daily/weekly digests (TASK-06, NTF-01..05). 1.3 — October 22, 2026: BRD §25 Opportunity Recommendation reconciled (§3.23, OPP-01..22). 1.2 — October 22, 2026: needs-attention rules (TASK-05), report stage/template filters (RPT-05), PDF export (RPT-06), accessibility audit (NFR-07). 1.1 — October 21, 2026: Sales Trip Planner (§3.22, TRIP-01..11), lead status reasons (LEAD-06/07), reference lists (§5), open questions 8–13. (1.0: October 17, 2026; reviewed October 18, 2026) |
| Companion | `SPEC.md` (technical specification and screen designs) |
| Product name | LeadTrailPro since October 30, 2026 (formerly SalesTrackPro; the BRD calls it the Sales Tracker App). The rename commit names the site leadtrail.pro |
| Status legend | **Implemented** — in the current codebase · **Partial** — some of the requirement is built · **Planned** — not started, depends on an external service or a later phase |

Requirement IDs are stable and are referenced from `SPEC.md`. Each requirement keeps the BRD section it came from so the two documents can be read side by side.

---

## 1. Product overview

### 1.1 Purpose

LeadTrailPro is a web (and later mobile) sales-management application for a staffing/recruitment business. It manages leads from first prospecting through client conversion, records every interaction, links client email activity, supports collaboration and tasks, offers AI-assisted summaries and guidance, manages sales targets, and gives management reporting. (BRD §1)

### 1.2 Goals

1. One system of record for leads, interactions, documents, and candidate profiles.
2. A daily "Action Center" that tells each Sales Manager what to do today.
3. Measurable activity (calls, emails, visits, leads, conversions) against per-person targets.
4. Full accountability: ownership, approvals, archive, and configuration changes are audited.
5. Admin-maintained configuration (dropdown values, roles, targets, security) without code changes.

### 1.3 Technology direction (BRD §1)

React frontend, Node.js backend, responsive web experience, Android and iPhone support, Google Workspace/Gmail integration. The current implementation is a Next.js 16.4.3 application (React 19 on the client, Node.js route handlers on the server) backed by PostgreSQL, packaged with Docker for development and production, and verified by lint, type checks, a production build, and a Selenium browser suite (SPEC §2.3 and §12). Native mobile apps are out of scope for the current phase; the web UI is responsive.

### 1.4 Phasing

| Phase | Content | Status |
|---|---|---|
| Phase 1 — Core | Roles, authentication, leads with the full field set and status reasons, ownership, queued leads, search/filter/archive, interaction timeline, tasks, documents and profiles, action center, targets, reports, user administration, list of values, audit | Implemented (see per-requirement status) |
| Phase 2 — Internal features | Collaboration threads and mentions, rich-text notes, device authorization | Planned (in-app notifications and digests are built) |
| Phase 3 — Integrations | Google sign-in, Gmail linking and AI summaries, voice-to-text, OCR, job-board and review data, route optimization, live map, company, and job-listing providers for the Sales Trip Planner (TRIP-*; the planner itself is built and runs on sample data until keys are set), the Opportunity Recommendation module (OPP-*, scheduled job-listing searches), push/email notifications | Planned; a first cut of Gmail linking (per-user read-only mailbox link, lead Emails tab) is built and waits on a Google Cloud OAuth client |
| Phase 4 — Pipeline board (change request of November 11, 2026, after the Pipedrive trial) | An ordered stage list, a kanban Pipeline page with drag-and-drop, BD actions mapped to stages, per-stage reminders and next-step prompts, stage reporting (§3.24, PIPE-01..13) | Phases 1–2 (stages, mapping, board, lead page and list, per-stage reminders, next-step prompt, No next step) implemented November 11–12, 2026; Phase 3 planned (SPEC §10.11) |

---

## 2. Users and roles (BRD §2)

| Role | Description | Core permissions |
|---|---|---|
| **Sales Manager** | Owns and works leads | Create and own leads; update own leads; add interactions, tasks, comments, voice notes; transfer own leads to another Sales Manager or Admin; collaborate; view personal targets, follow-ups, and performance |
| **Recruiter** | Supports leads with candidate work | View leads and add notes/comments; otherwise read-only unless an Admin grants more |
| **Admin** | Full administrative and sales capability | Everything a Sales Manager can do, plus user administration, role display names, reporting for everyone, targets, queued-lead approval, archive management, list-of-values management, device authorization, security configuration, reassignment |

**ROLE-01** (Implemented) The system has exactly three underlying roles: Sales Manager, Recruiter, Admin.
**ROLE-02** (Implemented) An Admin can rename the display name of any role without changing its permissions.
**ROLE-03** (Implemented) An Admin can grant a specific account extra privileges beyond its role defaults (for example, letting a Recruiter create leads). This realizes "unless explicitly permitted by an Admin-controlled rule".

---

## 3. Functional requirements

### 3.1 Authentication, passwords, and device security (BRD §3)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| AUTH-01 | Only an email address pre-added by an Admin with an assigned role may access the application. | Sign-in with an unknown or inactive email fails with the same message as a wrong password. | Implemented |
| AUTH-02 | Sign-in with email and password. | Correct credentials create a session; passwords are never stored in clear text. | Implemented; since November 5, 2026 used only on stacks without a Google client (owner's decision: Google-only sign-in; `POST /api/auth/login` answers 403 otherwise) |
| AUTH-03 | Sign-in with Google/Gmail (OAuth 2.0). | A "Sign in with Google" button signs the user in when the Google email matches a pre-added account. | Implemented (November 5, 2026): one consent for identity and read-only Gmail, by the owner's decision, so every user's mailbox link exists from the first sign-in; an email without an active account sees "Sign-in failed: these credentials are not valid or you are not registered. Please contact your administrator." Accounts come from the seed file or Admin → Users. The Cloud console has the callback URI and a published consent screen (November 6, 2026; unverified, so the first consent shows Google's warning) |
| AUTH-04 | Every user can change their own password. | Requires the current password; other sessions are signed out. | Implemented; hidden with Google sign-in, where no password is stored (November 6, 2026) |
| AUTH-05 | Forgot-password flow sends a secure reset link or code to the registered email. | Link expires in 30 minutes; the response does not reveal whether the address exists. | Implemented; off wherever a Google client exists (the route answers 403), since no password is stored (November 6, 2026) |
| AUTH-06 | Two-factor authentication by OTP sent to the registered email; Admin enables and configures it per account. | After a correct password the user must enter a 6-digit emailed code that expires in 10 minutes; 5 wrong codes invalidate it. | Implemented; off wherever a Google client exists, since Google verifies the person (November 6, 2026) |
| AUTH-07 | Admin can enable automatic daily logout per account, with a configurable logout time that defaults to 11:00 PM Eastern. The user must sign in again afterwards, including 2FA when enabled. | Any session started before the most recent cutoff (business timezone) is rejected once the cutoff passes. The switch and the time are set per account under User management; the time defaults to 11:00 PM. | Implemented |
| AUTH-08 | Admin can authorize specific company phones and laptops per Sales Manager or Recruiter and restrict sign-in to those devices. | Sign-in from an unauthorized device is refused when the policy is active. | Planned (needs a managed-device or mobile identifier; browsers cannot read hardware IDs) |
| AUTH-09 | The system maintains device-identification information and login history. | Every sign-in attempt stores time, result, address, and browser; Admin can view it per user. | Partial (login history implemented; device identifiers planned) |
| AUTH-10 | Admin has a Device Authorization screen listing devices, assigned person, type, first/last login, status, with authorize, revoke, and reassign actions. | — | Planned |
| AUTH-11 | Sign-in attempts are rate limited. | After 10 failures for an email (or 50 from one address) within 15 minutes, further attempts return "try again in 15 minutes". | Implemented (added for security; not in BRD) |

### 3.2 Sales Manager Action Center (BRD §4)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| AC-01 | After sign-in the user lands on the Action Center, not the lead list. | Default route is the Action Center. | Implemented |
| AC-02 | Top performance cards: Calls Made, Emails Sent, Visits Made — this week vs last week. | Counts come from logged activities; the comparison shows the percentage change. | Implemented |
| AC-03 | Follow-up lists for Yesterday (overdue), Today, and Tomorrow. | Lists are driven by each lead's follow-up date in the business timezone; "overdue" includes every date before today. | Implemented |
| AC-04 | Each follow-up row shows Client Name, Status, latest BD action, Follow-up Date, and owner; clicking opens the complete lead. | — | Implemented |
| AC-05 | Overdue items are visually emphasized. | Overdue tab is selected by default when it has items; rows and dates are highlighted. | Implemented |
| AC-06 | Performance cards drill down to the underlying activity list. | Cards open the report, which drills to the records behind each number. | Implemented |
| AC-07 | Admins can view the Action Center for the whole team. | Scope toggle "My work / Whole team". | Implemented (extension) |

### 3.3 Left-hand navigation (BRD §5)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| NAV-01 | Persistent left navigation on desktop/tablet; collapsible drawer on mobile with the same information architecture. | — | Implemented |
| NAV-02 | Items: Action Center/Home, My Leads, All Leads, Cold, Warm, Hot, Client, Queued Leads, Archive, Lead Generation, Tasks, Road Visit Planner, Dashboard/Reports, Targets/Target Templates, Admin/User Management, List of Values, Device Authorization; the updated BRD adds Opportunity Recommendation with its submenu and badge (OPP-02). | Admin-only items are hidden from users without the privilege. The Sales Trip Planner (§3.22) has its own item under Tools for users with the plan_trips privilege (Admins and Sales Managers by default). | Implemented (Device Authorization opens a placeholder; Opportunity Recommendation planned) |
| NAV-03 | Lead views sort by most recent activity first unless another sort is chosen. | — | Implemented |
| NAV-04 | Archive has its own search and filters. | — | Implemented |

### 3.4 Lead record and data fields (BRD §6)

**LEAD-01** (Implemented) A lead has the following fields. Required fields are marked ★. Duplicate guard since November 6, 2026: a new lead that matches an existing one on client email, website, phone, or company name is refused with a link to that lead; a similar name at the same address or an archived match warns and can be overridden (SPEC §7.15).

| # | Field | Input | Rule |
|---|---|---|---|
| 1 | Lead Type ★ | Dropdown | Road Trip / Cold Call / Cold Email (Admin-maintained) |
| 2 | Sales Manager / Owner ★ | User reference | Creator becomes owner; transferable to a Sales Manager or Admin |
| 3 | First Contact Date ★ | Date | Drives the queued-lead rule |
| 4 | Client Name ★ | Text, 200 | |
| 5 | BD Action | Dropdown | Appendix B |
| 6 | Client Response | Dropdown | Appendix B |
| 7 | Status ★ | Dropdown | Cold / Warm / Hot / Client / Lost Lead / Disqualified (LEAD-06) |
| 8 | Address | Text, 500 | Street/location address |
| 9 | Comments | Text | |
| 10 | City | Dropdown | Appendix B, Admin-maintained |
| 11 | Follow-up Date | Date | Drives the Action Center |
| 12 | Client Executive | Text, 160 | Contact person |
| 13 | Contact No. | Phone | |
| 14 | Ext. / Alternate No. | Phone | |
| 15 | Contact Remark | Text, 500 | |
| 16 | Client Email | Email list | One or more addresses, validated individually, max 10 |
| 17 | Client Industry | Text, 120 | |
| 18 | Position(s) | Text | Open or target positions |
| 19 | Contract Signed Date | Date | |
| 20 | Interaction Notes | Timeline entries | Timestamped, attributed, newest first (see 3.10) |
| 21 | Lead Category | Dropdown | Skilled / Non-Skilled / Both |
| 22 | Company Size | Dropdown | Large / Medium / Small |
| 23 | Documents | Files | General lead documents (see 3.13) |
| 24 | Resumes / Profiles Shared | Files | Dedicated multiple-file area (see 3.13) |
| 25 | Status Reason | Dropdown | Required when Status is Lost Lead (Admin-maintained reasons) or Disqualified (fixed reasons); cleared for every other status (LEAD-06) |
| 26 | Opportunity reference | Link | Planned (OPP-12): the Opportunity and job listing a converted lead came from |

**LEAD-02** (Implemented) Company website URL is also stored (used by lead generation and shown on the lead).
**LEAD-03** (Implemented) Dates are entered and displayed in the user's locale; the BRD's MM/DD/YYYY is a display preference, storage is ISO.
**LEAD-04** (Implemented) Validation errors name the field and the rule (length, format, missing).
**LEAD-05** (Implemented) Dropdown values that have been deactivated remain valid on existing leads but cannot be chosen for new entries.
**LEAD-06** (Implemented; change note of October 21, 2026, §8) Status is standardised and gains two closed values, Lost Lead and Disqualified, each carrying a Status Reason. Disqualified reasons are fixed: Not Interested; Bad Timing / Not Right Now; No Longer Interested; Cannot Contact; Does Not Meet Criteria. Lost Lead reasons are Admin-maintained (for example Pricing). A reason is required whenever the status is Lost Lead or Disqualified and is blank otherwise. Status and reason display together as "Status – Reason" (for example "Disqualified – Not Interested", "Lost Lead – Pricing") throughout the CRM and in the Sales Trip Planner (TRIP-07). Lost Lead and Disqualified join the core statuses that cannot be deactivated (LOV-04). As built: changing a lead to Lost Lead or Disqualified from the lead header or the edit form asks for the reason; the reason can be changed in place afterwards; the timeline records "Status changed from Warm to Disqualified – Not Interested"; the lead stays active (no automatic archive) and is left out of the Action Center's needs-attention list; Disqualified reasons can be renamed but not added to or deactivated.
**LEAD-07** (Implemented) Lead lists and the Archive filter by status and, for Lost Lead and Disqualified, by reason; the keyword search also matches the reason text (extends SRCH-02). Navigation keeps the four pipeline views; closed leads are found through the status filter (open question 11 records the defaults chosen).

### 3.5 Lead ownership, transfer, and reassignment (BRD §7)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| OWN-01 | The Sales Manager who creates a lead becomes its owner. | Owner defaults to the creator; an Admin may choose another owner at creation. | Implemented |
| OWN-02 | The owner may transfer ownership to another active Sales Manager or Admin. | Recruiters and inactive users cannot receive leads. | Implemented |
| OWN-03 | Admin may reassign an individual lead or bulk-reassign selected leads. | — | Implemented; since November 6, 2026 every Sales Manager has the same ability (owner's decision: no Admin bottleneck when a colleague is away; every move is audited) |
| OWN-04 | When an Admin terminates a Sales Manager, that person's leads can be assigned to another Sales Manager, to the Admin, or to another Admin. | Termination requires choosing a successor; every lead and open task moves. | Implemented |
| OWN-05 | Ownership changes are audit logged with previous owner, new owner, actor, date/time, and optional reason. | — | Implemented |
| OWN-06 | Open tasks, follow-ups, and reminders tied to ownership are reassigned or reviewed during transfer. | Open tasks on the lead that were assigned to the previous owner move to the new owner; the count is shown in the audit entry. | Implemented |

### 3.6 Lead creation date control and queued leads (BRD §8)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| QUE-01 | A Sales Manager cannot directly create a lead with a First Contact Date earlier than yesterday. | Such a lead is saved as Queued; Admins (anyone with the approve privilege) save it directly as active. | Implemented |
| QUE-02 | Queued leads appear in a dedicated navigation view for authorized users. | Queued Leads view with a count badge. | Implemented |
| QUE-03 | Admin can approve or reject a queued lead; the decision and comments are audit logged. | Approval activates the lead; rejection archives it with the reason "Rejected: …" so it stays searchable. | Implemented |

### 3.7 Search, filter, and archive (BRD §9)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| SRCH-01 | Keyword search across lead data and searchable text anywhere in the lead except attachment contents. | Matches client name, executive, address, comments, industry, positions, phones, remark, emails, dropdown values, owner, and timeline summaries/notes. | Implemented |
| SRCH-02 | Filters: Lead Type, Status, Lead Category, Company Size, City, Owner, Client Response, BD Action, First Contact Date range, Follow-up Date range, Contract Signed Date range. | All available; combinable. | Implemented |
| SRCH-03 | Search and filters apply to active views and the Archive. | — | Implemented |
| SRCH-04 | Admin can select one or many leads from results and archive them in bulk. | Also available to anyone granted the archive privilege. | Implemented |
| SRCH-05 | Archived leads remain under Archive with independent search/filter and can be restored. | — | Implemented |
| SRCH-06 | Sort by most recent activity, first contact date, follow-up date, client name, owner (and creation date). | Ascending or descending. | Implemented |
| SRCH-07 | Lists are paginated. | 50 per page by default, up to 200. | Implemented (extension) |

### 3.8 Interaction notes and voice-to-text (BRD §10)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| NOTE-01 | Notes are stored as individual timeline entries with author and date/time, newest first. | — | Implemented |
| NOTE-02 | Sales Managers and permitted Recruiters can add notes; historical notes stay attributed. | Recruiters have the note privilege by default. | Implemented |
| NOTE-03 | Rich text: bold, italics, lists, links. | Notes, call/email/visit remarks, collaboration messages, and task comments share one editor and a safe text format (`**bold**`, `_italic_`, `- lists`, `1. lists`, `[links](https://…)`, bare URLs) with a toolbar; text is stored as written and rendered without HTML, so older plain-text notes display unchanged. | Implemented |
| NOTE-04 | Voice-to-text for notes on computer, Android, and iPhone; transcription editable before saving. | A microphone button on the editor uses the browser's speech recognition (Chrome and Edge on desktop and Android, Safari on iPhone and Mac; Firefox has none, so the button is hidden there). Recognised phrases are inserted at the cursor as they are confirmed and can be edited before saving; the page must be served over HTTPS (or localhost) for the browser to allow the microphone. | Implemented (browser-dependent) |
| NOTE-05 | Natural-language follow-up instructions inside notes may create tasks/reminders after confirmation. | A next-step phrase with a date in a note (or in the notes of a call, email, or visit) offers a task with the resolved date, time, and title shown for review. The task is created on save only while the offer stays ticked, and the lead's follow-up date moves to it. | Implemented |
| NOTE-06 | Calls, emails, and visits can be logged as timeline entries with a summary, notes, and the time they occurred. | These entries feed the Action Center and reports. | Implemented (extension that makes AC-02 measurable) |

### 3.9 Follow-up interpretation, tasks, and reminders (BRD §11)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| TASK-01 | Tasks can be created manually or directly from a lead (and later from notes, emails, threads). | Manual creation, creation from a lead, and creation from notes (NOTE-05) are available; emails and threads wait on Phases 2 and 3. | Partial |
| TASK-02 | Task fields: lead, title, description, assignee, due date/time, priority, status, checklist, creator, timestamps. | All present. | Implemented |
| TASK-03 | Natural-language due dates typed in notes or task fields: "follow up tomorrow", "follow up Monday", an explicit date such as "Feb/01/2026", "next week", "next month", a month name such as "January", or a period such as "six months". A month name alone resolves to the first working day of that month, subject to the business-calendar configuration. Relative periods ("six months") are counted from the date of the source interaction, not from today. | The resolved date is shown beside the field in the task form, the follow-up scheduler, and the note form before anything is saved. Month names and relative periods skip weekends and the holidays in the business calendar; weekday names are kept unless they fall on a holiday; explicit dates are kept as written. Notes count relative periods from the interaction date. | Implemented |
| TASK-04 | Task updates notify assignees; users can comment and use collaborative checklists. | Checklists; assignee notified in-app (and by email on request) when a task is assigned, changed, or completed, and the creator when someone else completes it; comments on every task (rich text, @mentions, references to the lead's files, author edits, Admin removal with audit) notify the assignee, the creator, earlier commenters, and anyone mentioned; task cards show the comment count. | Implemented |
| TASK-05 | Remind the responsible Sales Manager when a lead has had no action for one week, based on configurable action/status rules. | "Needs attention" list on the Action Center. Admins set a default number of days plus rules per status, per BD action, or per status-and-BD-action pair; the most specific rule wins, each flagged lead shows the limit that applies, and Lost Lead / Disqualified leads are never flagged. Reminder delivery by email is TASK-06. | Implemented |
| TASK-06 | Daily and weekly reminders for pending/overdue activities. | A daily digest (overdue, today's, and tomorrow's follow-ups, open and overdue tasks, leads needing attention, yesterday's counts) and a weekly digest (last week's numbers and target progress, this week's follow-ups, plus team totals for administrators) go to every Sales Manager and Admin as an in-app notification and by email when a mail provider is configured. Admins set the times and weekday under Settings and can send either digest to themselves at once; people opt out under Notification preferences. A `jobs` scheduler service (or any cron calling the job endpoint) triggers the runs, which happen once per period. | Implemented |
| TASK-07 | Scheduling a follow-up from a lead sets the lead's follow-up date and creates a reminder task for the owner. | — | Implemented (extension) |

### 3.10 Collaboration and messaging (BRD §12)

| ID | Requirement | Status |
|---|---|---|
| COLL-01 | Lead-specific threaded messages and comment threads. | Implemented: Collaboration tab on the lead with threads and one level of replies; the tab shows the live message count |
| COLL-02 | Mentions: @user, @all, @admin, @recruiter, @salesmanager, generating in-app, email, or push notifications by preference. | Implemented for in-app and email: typing @ opens a picker of the groups and active people; mentioned people get a `mention` notification, the lead owner and the thread's other authors a `message` notification; email follows the person's event-email preference; push waits on the native app |
| COLL-03 | Reply, quote, edit own messages; timestamps and attribution; rich text. | Implemented: Reply, Quote (the quoted excerpt and author stay with the reply), Edit for the author (marked "edited"), author, role, and relative time on every message, rich text per NOTE-03 |
| COLL-04 | Ordinary users cannot hard-delete; Admin may soft-delete with audit history. | Implemented: nobody can hard-delete; administrators (privilege `moderate_messages`) remove a message after confirming, the thread shows "Message removed by …", and the audit entry `message.deleted` keeps the original text |
| COLL-05 | Real-time updates, typing indicators, presence showing who is viewing the lead. | Partial: the thread list refreshes every 20 seconds while the tab is open; typing indicators and presence are planned (open question 15) |
| COLL-06 | Files can be referenced from messages, comments, and tasks. | Implemented: message and task-comment composers list the lead's documents and profiles to reference; the message or comment links to them |

### 3.11 Files, attachments, and candidate profiles (BRD §13)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FILE-01 | Supported types: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, images, TXT. | Other types are refused; 15 MB limit. | Implemented |
| FILE-02 | In-app preview without downloading. | PDF, images, text, and Word (text extraction) preview in place; others download. | Implemented |
| FILE-03 | Download remains available when permitted. | Anyone who can view leads can download. | Implemented |
| FILE-04 | Version control for replaced/updated files. | Re-uploading a file with the same name and label creates the next version linked to the previous one. | Implemented |
| FILE-05 | Dedicated Resumes/Profiles Shared area with multiple files and audit tracking. | Separate tab and category; uploads are audited and appear on the timeline. | Implemented |
| FILE-06 | Optional AI summaries of documents and profiles. | — | Planned |
| FILE-07 | Uploads can notify collaborators. | — | Planned |
| FILE-08 | Admin can soft-delete files while retaining audit records. | Deleted files stay visible to Admins and in the audit log. | Implemented |

### 3.12 Visiting card capture and OCR (BRD §14)

| ID | Requirement | Status |
|---|---|---|
| OCR-01 | Upload a business-card image or capture it from a phone camera. | Planned |
| OCR-02 | OCR extracts name, company, title, phone, email, address. | Planned |
| OCR-03 | Extracted values are reviewed and corrected before populating the lead. | Planned |

### 3.13 Gmail / Google Workspace email integration (BRD §15)

| ID | Requirement | Status |
|---|---|---|
| MAIL-01 | Emails sent to and received from the client email addresses are linked to the lead. | Implemented (November 7, 2026): the lead's Emails tab lists recent messages live from the viewer's connected Gmail (administrators: every connected mailbox), and the mailbox watch scans every connected mailbox every five minutes, stores the messages exchanged with a lead's client addresses in `lead_emails`, stamps the lead with the client's last email, flags leads awaiting a reply (Action Center, lead list, lead page, daily digest), and notifies the owner of new client emails (SPEC §10.2) |
| MAIL-02 | The owner's mailbox is the primary mailbox; on transfer, future association follows the new owner, history is preserved. | Partly (November 6, 2026): a salesperson sends email to the lead's contacts from their own Gmail through the Google app, with the lead's documents attached, and replies inside the thread; the trail shows sent and received mail and the timeline logs the send. The owner-mailbox association on transfer is still planned |
| MAIL-03 | Lead Email tab shows sent and received emails as threads in chronological conversation view, with sender, recipients, subject, timestamp, body preview/body, and permitted attachments. | Partial — newest 25 messages with direction, sender, recipients, subject, time, and body text; threads and attachments planned |
| MAIL-04 | Reply, forward, and attach from within the application when authorized. | Planned |
| MAIL-05 | Create follow-up tasks from emails. | Planned |
| MAIL-06 | AI suggests a follow-up email from the full thread. | Planned |
| MAIL-07 | Each lead shows an Email Summary (discussions, commitments, questions, pending responses, dates, next actions). | Planned |
| MAIL-08 | Each lead shows an Interaction Summary across notes, calls, visits, tasks, voice notes, collaboration, documents. | Planned |
| MAIL-09 | Summaries refresh when new information is added. | Planned |

### 3.14 Lead generation module (BRD §16)

| ID | Requirement | Status |
|---|---|---|
| LGEN-01 | Enter company name and URL; get company/industry overview, open positions (Indeed, careers page), hiring challenges, Glassdoor interview summary where available, Google review summary, AI engagement approach, AI introduction email. | Planned (preview screen exists) |
| LGEN-02 | Suggest similar companies within a radius in kilometres. | Planned |
| LGEN-03 | Move road-visit candidates into the planner or convert to leads. | Partial (convert opens the new-lead form) |
| LGEN-04 | Every result is saved to the Sales Manager's Lead Generation List with date and user. | Planned |
| LGEN-05 | Admin reporting on lead generation for all and individual Sales Managers with filters. | Planned |

### 3.15 Road visit planner (BRD §17)

| ID | Requirement | Status |
|---|---|---|
| PLAN-01 | Select a date and enter/select companies (name, URL, address). | Planned (preview screen exists) |
| PLAN-02 | Optimized visit plan/route with a ~30-minute lunch break around 1:30 PM. | Planned (needs a routing service) |
| PLAN-03 | Company summary and open positions per stop. | Planned |
| PLAN-04 | Visits performed feed activity and performance reporting. | Implemented (logged visits count toward targets and reports) |

### 3.16 Targets, stages, and templates (BRD §18)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| TGT-01 | Admin sets daily and weekly targets for leads created. | Template fields: leads per day, leads per week. | Implemented |
| TGT-02 | Admin sets minimum road visits per day/week. | Template fields: visits per day, visits per week. | Implemented |
| TGT-03 | Admin sets a monthly target for leads converted. | Template field: conversions per month. | Implemented |
| TGT-04 | Productivity stages: Onboarding, Training, Full Productive, each with its own targets. | Stage per user; a default template per stage; Admin can add templates. | Implemented |
| TGT-05 | Reusable templates assignable to one or more Sales Managers. | — | Implemented |
| TGT-06 | Target achievement is visible to the Sales Manager and Admin and included in reports. | Action Center card and report column. | Implemented |

### 3.17 Dashboards and reports (BRD §19)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| RPT-01 | Sales Manager dashboard: calls/emails/visits this week vs last week; follow-ups yesterday/today/tomorrow; target achievement, lead creation, conversions, outstanding tasks, recent activity; graphical with drill-down. | — | Implemented |
| RPT-02 | Admin performance dashboard: summary for all Sales Managers; click a name for the individual report. | — | Implemented; the Analytics screen (November 6, 2026) adds the pipeline by status now and over time, movement between statuses with the funnel and moves backwards, lost and disqualified reasons, time in status, stalled leads with the reason for each, the opportunity pool funnel, breakdowns by industry, city, and lead type, the clients worked most, and a leaderboard, filterable by salesperson, status, lead type, city, industry, client, source, and job type. Team board added November 7, 2026: one row per salesperson now (active, overdue, stalled, client replies waiting, this week's activity, last active), sorted by what is waiting on them, each number opening the leads |
| RPT-03 | Periods: Today; Yesterday (business-day logic); This Week; Last Week; Month to Date; Last Month; Year to Date. | "Yesterday" skips weekends and the holidays in the business calendar. | Implemented; since November 6, 2026 also rolling windows (last 24 hours, 7, 30, and 90 days, 12 months) and a custom range |
| RPT-04 | Drill-down from charts/cards to the exact leads/activities behind each number; open the entire lead from there. | — | Implemented, including the Analytics charts: a status tile or owner bar opens the leads behind it, the stalled list opens the lead |
| RPT-05 | Tool engagement report for all Sales Managers and for an individual: logins, usage time where measurable, leads created/updated/converted, interactions, tasks created/completed, voice notes, documents attached, other feature usage; filters by date range, person, role/stage, and target template; graphical presentation with drill-down to supporting records. | Counts for logins, leads, updates, conversions, interactions, tasks, files are in the report with drill-down; team reports filter by period, person, stage, and target template (also applied to exports); usage time and voice notes are not measured (open question 7). | Partial |
| RPT-06 | Reports exportable to PDF/Excel. | Excel (.xlsx), PDF, and CSV exports of the performance report, honouring the RPT-05 filters; the Sales Trip field-visit report also exports to Excel and PDF. | Implemented |

### 3.18 Admin user management (BRD §20)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| USR-01 | Admin can add, invite, view, edit, deactivate/terminate, and manage accounts of all three roles. | Add, view, edit, terminate, reactivate implemented; "invite" is an emailed set-password link, available once SMTP is configured. | Implemented |
| USR-02 | Admin pre-adds email and role before the person can sign in. | — | Implemented |
| USR-03 | Admin can add another Admin. | At least one active Admin must always remain. | Implemented |
| USR-04 | Admin can configure role display names. | — | Implemented |
| USR-05 | Admin can enable/configure 2FA and 11 PM auto-logout per account. | The auto-logout switch and its time of day are per account. | Implemented |
| USR-06 | Admin can manage authorized company devices per person. | — | Planned |
| USR-07 | Terminated accounts lose sign-in access but remain in historical audit records. | Sessions are revoked immediately; the record is kept and marked terminated. | Implemented |
| USR-08 | Termination prompts for lead reassignment (another Sales Manager, the Admin, another Admin), selective or bulk. | — | Implemented |
| USR-09 | Admin can bulk assign/reassign leads from one owner to another. | — | Implemented |
| USR-10 | Admin can set a user's password directly. | Needed while email delivery is not configured. | Implemented (extension) |

### 3.19 Admin list-of-values management (BRD §21)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| LOV-01 | Admin maintains the values of all configurable dropdowns. | Lead type, status, BD action, client response, lead category, company size, city, Lost Lead reason, business type. Disqualified reasons are fixed (rename only). | Implemented |
| LOV-02 | Add, activate/deactivate, reorder, and edit metadata. | — | Implemented |
| LOV-03 | Rename a value; existing records display the new value; audit keeps the original. | Rename updates the single stored value; the audit entry records old and new names. | Implemented |
| LOV-04 | Deleting a value in use is handled as deactivate/retire. | There is no delete; deactivation keeps the value on existing leads. The six core statuses and the Disqualified reasons cannot be deactivated. | Implemented |
| LOV-05 | Changes are audit logged. | — | Implemented |

### 3.20 Notifications (BRD §22)

| ID | Requirement | Status |
|---|---|---|
| NTF-01 | Channels: in-app, email, mobile push. | Partial: in-app (bell in the top bar with unread count, list, mark read, jump to the lead or task) and email (stub or SMTP) are built; mobile push needs the native app |
| NTF-02 | Events: mentions, comments, task assignment/update, lead status change, file upload, follow-up reminders, queued-lead events, ownership transfer, others configured; the updated BRD adds the Opportunity events of OPP-20. | Partial: mentions (to the people or groups named) and messages (to the lead owner and the thread's authors); task assigned, updated, and completed; lead status or reason change (to the owner); ownership transfer (to both owners); queued lead created (to reviewers) and approved or rejected (to the creator and owner); document or profile upload (to the owner); a client email found by the mailbox watch (to the lead owner, November 7, 2026); follow-up reminders through the digests. Opportunity events wait on OPP-* |
| NTF-03 | Daily and weekly performance reports by role and preference. | Implemented in the digests: yesterday's counts in the daily digest, last week's numbers and target progress in the weekly one, and team totals for administrators |
| NTF-04 | Daily and weekly reminders summarizing due/overdue follow-ups and tasks. | Implemented (TASK-06) |
| NTF-05 | Per-account preferences subject to mandatory Admin/security notifications. | Implemented: each person chooses the daily digest, the weekly digest, and emailing of individual events under Notification preferences; in-app notifications are always on; there are no mandatory security notifications yet |

### 3.21 Audit and compliance (BRD §23)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| AUD-01 | Audit lead creation and updates with field-level changes. | Each update records only the changed fields with before and after values. | Implemented |
| AUD-02 | Audit ownership transfer, assignment, archive/restore, queued approval/rejection, user/role changes, device authorization, security configuration, list values, messages/comments, tasks, documents, profile uploads; the updated BRD adds the Opportunity actions of OPP-21. | All implemented features write audit entries (including sales trips); messages, devices, and opportunities are planned. | Implemented for built features |
| AUD-03 | Records include actor, timestamp, action, affected record, before/after values. | — | Implemented |
| AUD-04 | Notes display author and date/time, newest first. | — | Implemented |
| AUD-05 | Soft-deleted content remains represented in audit history. | Files: yes. Messages: planned. | Partial |
| AUD-06 | Admins can view the audit history of a lead on the lead itself. | "Audit" tab on the lead for users with the audit privilege. | Implemented (extension) |

### 3.22 Sales Trip Planner (change note of October 21, 2026)

The change note amends a "Sales Trip Planner" requirement that the BRD/SRS does not contain under that name; the nearest BRD items are the similar-company search in §16 (LGEN-02, LGEN-03) and the road visit planner in §17 (PLAN-*). Until the client supplies the original planner specification, the change note plus those sections are treated as the whole requirement (open question 8). Section 8 of the change note alters the lead record itself and is recorded as LEAD-06 and LEAD-07. Design: SPEC §10.8 and screen A16. As built on October 21, 2026: the planner runs end to end on sample company data (`TRIPS_PROVIDER=stub`, the default in the Docker development stack); live data needs the Google Maps adapter with `MAPS_API_KEY` and a licensed job aggregator behind `JOBS_API_URL`/`JOBS_API_KEY` (open questions 9 and 10).

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| TRIP-01 | A Sales Manager defines a sales trip by Trip Title, Address (starting or target address/neighbourhood), Radius Type (kilometres or driving minutes), Radius, Business Type, and Number of Results. | Business Type is an Admin-maintained list seeded with Manufacturing, Warehouse / Distribution, Bakery / Food Manufacturing, Any. Number of Results is a whole number, maximum 50. | Implemented |
| TRIP-02 | The search returns at most the requested number of companies; when fewer match, all matches are returned. | — | Implemented |
| TRIP-03 | Results are listed with the columns Company, Company Address, Distance, Hiring, Action, in that order. | Distance is measured from the trip address in the chosen unit. | Implemented |
| TRIP-04 | The company name links to the company's official website and opens in a new tab; when no website is identified the name is plain text. | — | Implemented |
| TRIP-05 | Company Address shows the full business address and is included in Excel exports and printed reports. | — | Implemented |
| TRIP-06 | Hiring shows the number of active job listings found for the company ("8 Jobs"); when greater than zero it opens an in-app dialog listing Job Title, Job Portal / Source, Location, Date Posted, Employment Type (when available), and a View Job link to the original posting. | Sources are supported job portals such as Indeed, subject to NFR-08 (open question 10). | Implemented on the job-sources layer (SPEC §7.13): the nearest companies are looked up when a trip is created, the rest on demand with a Check link; several sources are combined behind a cache with per-source budgets. Live key: HasData (Indeed) since November 1, 2026, the only source in use since November 7, 2026 (Adzuna and JSearch optional); calls, credits, HasData's live balance, and administrator alerts under Settings → Job listing sources, plus a usage card on the planner and Opportunities pages |
| TRIP-07 | Action is computed by matching the company against existing leads and clients on company name, address, website/domain, and phone number. Values: Cold Lead, Warm Lead, Hot Lead, Client, Lost Lead – [Reason], Disqualified – Not Interested, Disqualified – Bad Timing / Not Right Now, Disqualified – No Longer Interested, Disqualified – Cannot Contact, Disqualified – Does Not Meet Criteria, New / Not in CRM. | Depends on LEAD-06. Matching rules and precedence are open question 12. | Implemented |
| TRIP-08 | The list can be filtered by Action, including combined status/reason values. | — | Implemented |
| TRIP-09 | The list can be sorted ascending or descending by any applicable column. | — | Implemented |
| TRIP-10 | Companies can be shortlisted from the results. | — | Implemented |
| TRIP-11 | The list can be exported to Excel and printed as a field-visit report, both including Company Name and Company Address, with a scope of All Results, Filtered Results, Shortlisted Companies, or Planned Visits. | Planned Visits are shortlisted companies placed on a road visit plan (PLAN-01). | Implemented; a planned visit is a date set on a shortlisted company until the road visit planner (PLAN-01) exists |

### 3.23 Opportunity Recommendation (BRD §25, added in the updated BRD/SRS of October 19, 2026)

A module that finds sales opportunities in public job listings: Sales Managers keep saved Search Terms, a scheduled morning run queries the configured channels (Indeed first, more channels later), new listings become Opportunities that can be reviewed, converted to leads, or marked irrelevant, and Admins manage channels, schedules, and reporting. It shares the job-source abstraction and open question 10 with the Sales Trip Planner (§3.22) and the delivery channels of §3.20. Design: SPEC §10.10. **Built on November 6, 2026 in the reduced form the project owner chose (open question 14): one shared pool of hiring companies fed by administrator-kept keyword searches a few times a week; salespeople assign a card to themselves or a colleague, which creates the lead, or mark it not relevant; companies that are already leads or clients receive their new listings directly. The statuses below say what each item became.**

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| OPP-01 | Opportunities are identified automatically from permitted public job-listing sources. Indeed is the initial channel; Admins can add and configure further channels without changes to the core workflows (25.1, 25.4). | Each channel is a connector behind a common interface; Indeed is not hard-coded. The Indeed channel will use HasData's Indeed Jobs Scraper API (open question 10, SPEC §10.8 and §10.10). | Implemented (November 6, 2026): every job-source adapter (Adzuna, JSearch, Indeed through HasData, custom JSON, sample) answers keyword searches; sources are enabled and budgeted under Settings → Job sources rather than a channel screen |
| OPP-02 | A dedicated "Opportunity Recommendation" item in the left navigation with the submenu Dashboard, My Opportunities, Search Terms, New Opportunities, Converted to Leads, Irrelevant, and a badge with the number of new opportunities (25.2). | — | Partly: an Opportunities item with a badge of new companies and the views Pool, Not relevant, Assigned as leads, Existing leads, plus Searches & runs for administrators; no dashboard submenu |
| OPP-03 | Sales Managers create and manage saved Search Terms with Search Name, Keyword, Job Type, Location, Channel/Source, Created Date, Expiry Date, Status (Active, Paused, Inactive), Created By, Last Run, Next Run, Opportunities Found, New Opportunities (25.3). | Active terms run on schedule; Paused terms keep history and are skipped; expired terms become Inactive automatically. | Changed by the owner's decision of November 6, 2026: one shared list of searches kept by administrators (name, a group of job titles, one location, posted-within days, job type, cap, active) instead of per-Sales-Manager terms; no expiry. Since November 7, 2026 a search holds up to ten job titles sent to Indeed as one OR query, one location, and a posted-within window, with defaults (titles, location, window) under Settings → Opportunity searches |
| OPP-04 | A Search Term uses one channel, several, or All Active Channels (25.4). | — | Partly: every enabled source answers every search; no per-search channel choice |
| OPP-05 | Admin "Opportunity Recommendation > Channels" screen: add, edit, activate, pause, deactivate, configure, and test a channel; restrict a channel to all or selected Sales Managers; fields Channel Name, Type (API, Public Job Feed, Career Page, other), Status, Connection/Configuration, Created Date/By, Last Successful Run, Last Error, Availability, Execution Priority (25.5). | — | Not built; sources are switched on and budgeted under Settings → Job sources |
| OPP-06 | A daily run at an Admin-configurable time and time zone executes every Active Search Term on its channels, normalises listings into one Opportunity format, detects duplicates, stores only new recommendations, and updates run statistics; one failing channel does not stop the others, and each channel execution records success, partial success, or failure (25.6). | — | Implemented: a scheduled run on the chosen weekdays at the chosen time (business time zone), each source within its budget, duplicates collapsed by job id or URL, one failing source does not stop the others, run statistics kept |
| OPP-07 | An Opportunity stores Company Name, Job Title, Job Type, Location, Posting Date, Description/Summary, Primary Channel, Source Name, Source Job ID, Original Job URL, Date Found, Search Term, Sales Manager, Status, Matching Keyword, Last Checked Date, and the other channels where it was found, and shows whether the company already exists as a Lead, Client, another Opportunity, or an earlier irrelevant Opportunity (25.7). | The CRM check reuses the Sales Trip Planner matching rules (TRIP-07). | Implemented in reduced form: one card per company with its listings (title, location, type, posting date, source, link), first and last seen, and whether the company is already a lead or client, in which case the listings attach to that lead |
| OPP-08 | Statuses New, Reviewed, Converted to Lead, Irrelevant; new opportunities stay highlighted until reviewed (25.8). | — | Changed: statuses New, Assigned as lead, Existing lead, Not relevant; no Reviewed |
| OPP-09 | Cross-channel duplicate detection on Source Job ID, URL, Company, Title, Location, Posting Date, and description similarity; one Opportunity lists every source; converted, irrelevant, or reviewed opportunities keep their status when rediscovered (25.9). | — | Implemented: dedupe on the source's job id or URL, grouping by normalised company name across sources; a converted or not-relevant card keeps its status when rediscovered (a role-level reason brings the company back only with a role not seen before) |
| OPP-10 | After the morning run each Sales Manager gets a Daily Opportunity Report of new opportunities grouped by Search Term with per-channel counts and the unique total, by email and in-app (push where enabled); Admin decides whether a "no new opportunities" report is sent (25.10). | Depends on NTF-01 delivery and the mail provider. | Partly: an in-app and email notification to salespeople when a run adds new companies; no per-term report |
| OPP-11 | Opportunity Dashboard cards: New, Found Today, Found This Week, Converted to Leads, Irrelevant, Active Search Terms; results grouped by Search Term with drill-down; filters by Search Term, Channel, Status, Job Type, Location, date range, keyword (25.11). | — | Partly: tab counts and a text filter; no dashboard cards or grouped drill-down |
| OPP-12 | Convert to Lead opens the Add Lead form pre-filled (Company Name, Location, City, Industry, Positions, Company Size where available, source job details, Opportunity reference); after saving, the Opportunity becomes Converted to Lead and both records link to each other (25.12). | Adds an Opportunity reference to the lead record (LEAD-01 #26). | Implemented: Assign as lead opens the lead form pre-filled (company, location, roles, listing links) with the owner to choose; the lead and the card link to each other; a card for a closed or archived lead reopens that lead instead of creating a second one |
| OPP-13 | Mark Irrelevant removes an Opportunity from recommendations but keeps it in history, with optional reasons: Existing Client, Existing Lead, Not Target Industry, Position Not Relevant, Company Not Suitable, Duplicate, Location Not Relevant, Other (25.13). | Reasons are an Admin list. | Implemented with the reason list under List of values (Existing client, Existing lead, Not our industry, Role not relevant, Company not suitable, Duplicate, Location not relevant, Other) and an optional note; Back to the pool reverses it |
| OPP-14 | Find Similar Opportunities runs an on-demand search across selected or all authorised channels, pre-filled from the Opportunity (Title, Keywords, Job Type, Location, Radius, Industry, Channels) and editable; results can be converted, marked irrelevant, opened at the source, saved, or refined (25.14). | — | Planned |
| OPP-15 | Run Search Now executes a Search Term on demand with its configured criteria, compares results with existing Opportunities, and records the run in Search History (25.15). | — | Implemented: Run searches now (administrators) runs every active search and records the run |
| OPP-16 | Each Search Term keeps an execution history: run date/time, run type (Scheduled, On-Demand, Similar Opportunity), channels, listings found, new opportunities, duplicates, status, error details (25.16). | — | Partly: one run history for all searches (started, trigger, result, listings, new companies, attached, per-source notes) and per-search last run, found, and new counts |
| OPP-17 | Admin configuration: daily run on/off, time and time zone, Daily Report on/off, email and in-app delivery, maximum automated searches per Sales Manager, expiry rules, duplicate-detection rules, retention, and the Job Type and Location value lists through List of Values (25.17). | — | Partly: schedule days and time, listings cap, and the notification switch under Settings → Opportunity searches; the reason list under List of values; no retention or expiry rules |
| OPP-18 | Channel performance report: opportunities found, unique found, new, converted, irrelevant, conversion rate, searches executed, successful, failed, last successful run per channel (25.18). | — | Planned |
| OPP-19 | Admin opportunity reporting for all or one Sales Manager by found, new, reviewed, converted, irrelevant, conversion rate, active terms, terms by Sales Manager, keyword, job type, location, and channel, with drill-down to the Opportunity, Search Term, Sales Manager, or converted Lead (25.19). | — | Planned |
| OPP-20 | Notifications: Daily Opportunity Report, New Opportunities, Search Term approaching expiry, Search Term expired, Scheduled Search failure, by in-app, email, and push where enabled (25.20). | Extends NTF-02. | Partly: the new-companies notification and the owner's notification when a listing attaches to their lead |
| OPP-21 | Audit of Search Term changes, status and expiry changes, scheduled and on-demand runs, similar searches, Opportunity status changes, conversions, irrelevant classification, channel changes, and Admin configuration, with actor, time, action, and before/after values (25.21). | Extends AUD-02. | Implemented for what exists: searches, runs, assignments, reopenings, not relevant, and restore are audited |
| OPP-22 | Sources are accessed only through technically and legally permitted methods, honouring APIs, terms, robots and access restrictions, and data-use rules; connectors are isolated so one source cannot disrupt the module (25.22). | Same constraint as NFR-08 and open question 10. | Implemented: the same adapters and budgets as the trip planner (SPEC §7.13) |


### 3.24 Pipeline board and stages (change request of November 11, 2026, after the Pipedrive trial)

The client saw Pipedrive and wants its workflow feel: a board of named stages that leads move through, drag-and-drop between stages, and a next step on every lead. The project owner took a Pipedrive trial, drafted the stages there, and decided on November 11, 2026 (open question 16) what to take over and what to leave: one pipeline for every lead type, counts only, the owner's own stage list, the status kept as a tag. Phase 1 was built the same night: the stage list and mapping, the board with drag-and-drop and the Move to… menu, the stage on the lead page, form, and list (SPEC §10.11, as-built note). Phase 2 followed on November 12, 2026 (early): per-stage reminder days, the next-step prompt with per-stage suggestions and an automatic option, and the No next step list. Phase 3 (the stage bar, bulk move, stage reporting) remains planned. Pipedrive's words map as follows: its Leads Inbox is the opportunity pool (§3.23), a Deal is a Lead, a stage is a new ordered list that the detailed BD actions roll up into, a rotting deal is a lead past its needs-attention limit (TASK-05), and Won is the Client status.

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| PIPE-01 | An ordered list of pipeline stages, managed by Admins under List of values (rename, reorder, add, deactivate), seeded with New Deal, Contact Made, Qualified, Profile Shared, Meeting Completed, Negotiations started, Contract Signed. | New Deal is the entry stage and cannot be deactivated. The draft's last step, People Deployed, is the Client status, not a stage. | Implemented (migration 18; List of values → Pipeline stage) |
| PIPE-02 | Every active lead is in exactly one stage; a new lead, including one assigned from the opportunity pool, starts in New Deal unless the form chooses otherwise. | Existing leads are placed once by the migration from their BD action (PIPE-03). | Implemented |
| PIPE-03 | Each BD action belongs to a stage (Admin-editable mapping, defaults in SPEC §10.11); recording a BD action that belongs to a later stage moves the lead forward and never back. | The tracker import places leads by the same mapping. | Implemented (Stage column on the BD action list; Recompute stages re-places every lead after the mapping changes) |
| PIPE-04 | A Pipeline page shows one column per stage with its count, cards for the active leads, the filters Mine / Team, lead type, owner, and status, and a text filter; cards sort by next step, then last activity. | Team view only for users who may view every lead. | Implemented (Pipeline under Workspace; 50 cards per column, then Show more) |
| PIPE-05 | A card can be dragged to another column or moved through a Move to… menu (keyboard and touch); every move writes a timeline entry and an audit row and can be undone from the toast. | Only users who may edit the lead can move it. | Implemented (undo from a bar above the board) |
| PIPE-06 | Each card shows the client name and city, the status tag (Cold, Warm, Hot), the owner, the last BD action, the next step (earliest open task or follow-up date, red when overdue, "No next step" when there is none), and a quiet marker when the lead is past its needs-attention limit. | — | Implemented (plus an awaiting-reply mark from the mailbox watch) |
| PIPE-07 | Client, Lost Lead, and Disqualified take the lead off the board; a reopened lead returns to the stage it had. | Status is not derived from the stage. | Implemented |
| PIPE-08 | Needs-attention rules can be set per stage, next to status and BD action. | Precedence in SPEC §10.11. | Implemented (rule rows gain a stage; migration 19 seeds the proposed days per stage once) |
| PIPE-09 | After a logged call, email, or visit, a BD action, or a stage move, the app offers the next task pre-filled from the stage's default (activity and business days, set under Settings → Pipeline); an Admin switch creates it automatically instead. | Skip is one click; weekends and holidays are skipped as for other dates. | Implemented (Settings → Pipeline next steps: activity and business days per stage, the prompt switch, the automatic switch) |
| PIPE-10 | Leads with no open task and no future follow-up date are flagged on the board, listed on the Action Center, and counted in the daily digest. | — | Implemented (board card, Action Center panel, daily digest section, weekly count) |
| PIPE-11 | The lead page shows a stage bar (current stage highlighted, click to move) and a Stage quick update; the lead list gets a Stage column, filter, and bulk move. | — | Partly: Stage quick update on the lead page, Stage on the form, Stage column and filter on the list; the stage bar and bulk move are Phase 3 |
| PIPE-12 | Analytics and the KPI emails show the pipeline by stage; later, stage over time, time in stage, and stage-to-stage conversion from the timeline. | — | Planned (Phase 3) |
| PIPE-13 | One pipeline for every lead type, counts only. Out of scope for now: several pipelines, deal value, expected close date and forecast, required fields per stage, email sequences, automations beyond the default follow-up task. | Decided by the project owner on November 11, 2026 (open question 16); the client confirms. | Decided |

---

## 4. Business rules (BRD Appendix C)

| ID | Rule | Status |
|---|---|---|
| BR-01 | Creator becomes lead owner. | Implemented |
| BR-02 | Owner may transfer a lead to another Sales Manager or Admin. | Implemented |
| BR-03 | The owner's email account is used to associate client email exchanges. | Planned |
| BR-04 | A First Contact Date earlier than yesterday creates a Queued Lead requiring Admin approval. | Implemented |
| BR-05 | Keyword search covers all searchable lead data except attachment contents. | Implemented |
| BR-06 | Admin can archive one or many filtered/searched leads. | Implemented |
| BR-07 | 2FA and the daily auto-logout time (default 11:00 PM Eastern) are configured per account by Admin. | Implemented |
| BR-08 | Authorized-company-device restriction is configured by Admin. | Planned |
| BR-09 | Admin can terminate a Sales Manager and reassign leads to another Sales Manager, self, or another Admin. | Implemented |
| BR-10 | All dropdown values are Admin-maintainable and renamable with audit history. | Implemented |
| BR-11 | "Yesterday" in reports means the previous business day (weekends excluded). | Implemented |
| BR-12 | "Today", weeks, and months are evaluated in the business timezone (default America/Toronto). | Implemented |

---

## 5. Reference data (BRD Appendix B)

All lists are Admin-maintainable. Seeded values:

- **Lead Type:** Road Trip, Cold Call, Cold Email
- **BD Action:** First Call, First Email, First Meeting, Left Brochure, HR Contact Information Received, Introduction Email Sent, Email Followups, Followup Call, Waiting For Profiles from Recruitment, Shared Profiles, Followup on Profiles, Engagement / Ans Questions, In Person Meeting Scheduled, Virtual/Phone Meeting Scheduled, Contract Sent, Contract Clarification (BRD spelling "Contract Clerification"), Contract Followup, Contract Signed, New Position, Plan a Visit
- **Client Response:** Approach Later, Engaged, Interested, Connected with HR, Not Interested, Do not use Agency, No Response, In Person Meeting Requested, Phone Call Requested, Left Voicemail, Got HR email, Not Hiring
- **Status:** Cold, Warm, Hot, Client, Lost Lead, Disqualified (core; renamable, not deactivatable)
- **Disqualified Reason** (fixed, LEAD-06): Not Interested, Bad Timing / Not Right Now, No Longer Interested, Cannot Contact, Does Not Meet Criteria
- **Lost Lead Reason** (Admin-maintained, LEAD-06): seeded with Pricing
- **Business Type** (Admin-maintained, TRIP-01): Manufacturing, Warehouse / Distribution, Bakery / Food Manufacturing, Any
- **Job Type** (Admin-maintained, OPP-03/OPP-17, planned): Full-Time, Part-Time, Contract, Temporary
- **Opportunity Location** (Admin-maintained, OPP-17, planned): to be seeded from the City list plus region values such as GTA
- **Irrelevant Reason** (Admin-maintained, OPP-13, planned): Existing Client, Existing Lead, Not Target Industry, Position Not Relevant, Company Not Suitable, Duplicate, Location Not Relevant, Other
- **Lead Category:** Skilled, Non Skilled, Both
- **Company Size:** Large, Medium, Small
- **Sales Manager Stage:** Onboarding, Training, Full Productive (fixed)
- **Roles:** Sales Manager, Recruiter, Admin (fixed; display names renamable)
- **City** (BRD order; three duplicate "Prov" entries collapsed to one, capitalization normalized, "St Catherines" corrected to "St Catharines", "Oro-Medonte,ON" spaced): Ajax, Alliston, Ancaster, Aurora, Balm Beach, Barrie, Beeton, Bowmanville, Brampton, Burlington, Caledon, Cambridge, Cobourg, Concord, Downsview, Downtown Toronto, Etobicoke, Georgetown, Glen Williams, Guelph, Hamilton, Kincardine, King City, Kitchener, Lindsay, Markham, Malton, Milton, Mississauga, Mount Forest, New Hamburg, Newmarket, North York, Oakville, Omemee, Oshawa, Peterborough, Pickering, Point Clark, Quinte West, Rexdale, Richmond Hill, Scarborough, Stoney Creek, Toronto, Trenton, Vaughan, Waterloo, Whitby, Yorkville, Belleville, Bloomfield, British Columbia, PEI, Quebec, Alberta, Manitoba, Prov, Kingston, Huntsville, Minesing, ON, Oro-Medonte, ON, Hillier, Port Colborne, Pefferlaw, Lincoln, Stouffville, Brantford, Bolton, Brockville, Ottawa, Innisfil, GTA, Queensville, London, Gormley, Stratford, Troy, Erin, Hagersville, Woodbridge, Halton Hills, Winnipeg, Markdale, St Catharines, East York, Thornhill (88 values)

---

## 6. Non-functional requirements (BRD §24)

| ID | Requirement | Status |
|---|---|---|
| NFR-01 | Responsive, polished interface optimized for lead work on desktop and mobile. | Implemented |
| NFR-02 | Real-time collaboration for messages/comments/tasks where supported. | Planned |
| NFR-03 | Secure API with role-based authorization enforced server-side. | Implemented |
| NFR-04 | Encryption in transit; protection for sensitive stored data. | TLS is a deployment responsibility (session cookies are Secure in production unless `APP_URL` declares a plain-http internal deployment); passwords are scrypt-hashed; session and reset tokens are stored only as SHA-256 hashes |
| NFR-05 | Scalable search/filter and activity timelines. | Server-side filtering with indexes and pagination |
| NFR-06 | Reliable audit logging and background notification processing. | Audit is written in the same transaction as the change; background processing planned |
| NFR-07 | Accessibility-minded forms, keyboard navigation, labels, validation messages, readable contrast. | Labels, roles, and keyboard dismissal are in place. An axe-core WCAG 2.1 A/AA audit runs in the browser suite (`07-accessibility.test.mjs`) over the sign-in screen, Action Center, lead dialog and timeline, lead list, tasks, reports, settings, list of values, user management, and trip planner; serious or critical findings fail the build. The October 22, 2026 audit found only colour-contrast failures, fixed by darkening every secondary text and badge colour to at least 4.6:1 against the lightest tints |
| NFR-08 | Integrations comply with Google Workspace and third-party terms and capabilities. | Applies to Phase 3 |
| NFR-09 | Rate limiting and brute-force protection on sign-in. | Implemented |

---

## 7. Assumptions, dependencies, and open questions

1. **Device identification.** Standard browsers cannot read a MAC address. Device authorization needs either a managed-device identifier (MDM), a native/mobile wrapper, or a registration token per browser. Decision pending.
2. **Email delivery.** The Google Workspace SMTP credentials supplied on October 22, 2026 were never verified, and `MAIL_PROVIDER=stub` kept every email feature working by recording messages in the Settings outbox. Findings of October 31, 2026: the development network now reaches smtp.gmail.com on ports 25, 465, and 587, and Google refuses an account password over SMTP (`534 5.7.9 Application-specific password required`); only an App Password (2-Step Verification on) or OAuth is accepted. The project owner is setting up one Google account to serve SMTP, the Maps key, and the Gmail OAuth client. Until its App Password is in `SMTP_PASSWORD`, `MAIL_PROVIDER=stub` remains the safe setting; `npm run mail:test` (SPEC §2) checks a mailbox without the app. Decided on November 6, 2026: no SMTP. Email goes out through the Google app (Gmail API) from a mailbox an administrator chooses under Settings → Email delivery; report emails stay behind a switch, off by default; no passwords are stored, so reset and two-factor emails no longer exist with Google sign-in. Until Google verifies the app the sending mailbox's token expires after seven days while the consent screen is in Testing.
3. **Google Workspace.** OAuth sign-in and Gmail linking share one Google Cloud OAuth client (project `leadtrailpro`, created November 4, 2026) and one callback. Sign in with Google was built on November 5, 2026: PKCE, the verified Google email matched to a pre-registered account (AUTH-01), and, by the project owner's decision of the same day, read-only Gmail requested in the same consent so that every user's mailbox link exists from the first sign-in and can serve later features or role changes. The accounts come from a seed file (administrator and role accounts, kept out of git) and afterwards from Admin → Users, so there is no self-registration. Accepted consequences: Gmail read-only is a restricted scope, so until Google verifies the app only the consent screen's listed test users can sign in at all (External user type; up to 100), and refresh tokens issued while the screen is in Testing expire after seven days, after which the Emails tab asks to reconnect; verification for a restricted scope includes a third-party security assessment when the app serves people outside the owner's Workspace. The callback URI was registered on November 5, 2026; still to do: enable the Gmail API and list the testers as test users. Also decided on November 5, 2026: sign-in is Google-only wherever the client is configured; the password form, the login API, and the Change password menu entry are off there, and password sign-in survives only for stacks without a client, such as the browser test suite.
4. **External data sources.** Indeed, company careers pages, Glassdoor, and Google reviews have their own terms; the BRD scopes these to "when lawfully/technically available".
5. **Business calendar.** Resolved: Admins keep the public-holiday list under Settings → Business calendar. Weekends and listed holidays are non-working days for "yesterday" in reports, target scaling, and natural-language dates.
6. **Native mobile.** Android/iPhone support is met by the responsive web app for now; native apps (camera capture, push) are Phase 3.
7. **Usage time.** "Application usage/time where measurable" requires client-side activity tracking that is not yet defined.
8. **Sales Trip Planner baseline.** The change note of October 21, 2026 says it amends an existing Sales Trip Planner requirement and asks that previously approved requirements be preserved, but neither BRD/SRS version contains a feature of that name. §3.22 treats the change note plus BRD §16/§17 as the whole requirement until the client provides the original planner specification.
9. **Company search and distance provider.** Searching companies by address and radius needs a geocoding and places provider (for example Google Places, which needs billing and limits how long results may be cached), and the driving-minutes radius needs a routing or isochrone service on top. Business types such as "Bakery / Food Manufacturing" do not map to a single provider category and need keyword rules. Provider, budget, and terms are undecided. Status: a Google Maps adapter (Geocoding, Places Text Search, Place Details, Distance Matrix) is written behind the provider interface and used when `MAPS_API_KEY` is set; it has not been exercised against a real key. October 31, 2026: Google Maps Platform bills per API with a monthly free allowance per SKU (about 10,000 calls for the Essentials SKUs the adapter uses) but requires a billing account with a card even for that allowance; the classic Places and Distance Matrix endpoints are marked legacy in favour of Places API (New) and Routes. No-card alternatives reviewed: Geoapify (free plan, 3,000 requests a day, geocoding, places, details, and route matrix on OpenStreetMap data), OpenRouteService (routing and geocoding only), and the public OpenStreetMap services for development. Their business coverage for industrial companies is thinner than Google's; a language model cannot replace geocoding or routing but could assist company discovery. Checked on Google's pricing pages on November 4, 2026: per-SKU free monthly allowances since March 1, 2025 (Essentials 10,000, Pro 5,000, Enterprise 1,000 billable events; billing must be enabled on the project). The adapter's four calls map to Geocoding (10,000 free), legacy Places Text Search (5,000 free, then USD 32 per 1,000), legacy Place Details with contact fields (5,000 free, then USD 17 per 1,000 plus data SKUs), and legacy Distance Matrix (10,000 free elements). The legacy Distance Matrix API can no longer be enabled on Google Cloud projects created after October 2026, and the project `leadtrailpro` is new, so on November 4, 2026 the adapter was moved to the current services: Places API (New) text search with the contact fields in one call (Enterprise SKU, 1,000 free calls a month, each returning up to 20 companies, in place of one Place Details call per company) and the Routes API route matrix for drive minutes (10,000 free elements a month); geocoding is unchanged. The mappers are unit-tested against responses shaped like Google's documentation; the live calls were run with the real key on November 6, 2026 and passed after one fix (the Geocoding API needs the key as a query parameter). November 6, 2026 (later): a key was created and put in `.env.local`; the app now meters every Google call per SKU and calendar month (SPEC §10.8 usage meter), refuses calls past the monthly budgets under Settings → Google Maps usage (defaults 90% of the free allowance), and notifies administrators at 80% and 100%; Google's free allowance is per SKU and resets monthly, and per-API daily quota caps in the Cloud console plus a Billing budget alert are recommended as the hard guarantee.
10. **Job listings source — closed October 26, 2026.** Decision: several sources combined behind one lookup with a per-company cache, free tiers first and the paid Indeed source last, each within a call budget set by the Admin (SPEC §7.13; built). Sources: Adzuna (free developer key), JSearch on RapidAPI (free tier), Indeed through HasData (paid beyond 100 calls a month), plus any custom JSON source. The Government of Canada Job Bank was checked and dropped: its open dataset carries no employer names, its search feed is reserved by its terms for people, and its XML feed is for job boards only. What the client still provides: the three keys and, after a half-day comparison on ten known hiring companies, the decision whether the paid Indeed plan is needed at all. History of the decision — October 25, 2026: Indeed through HasData's Indeed Jobs Scraper API (hasdata.com/apis/indeed-api). Indeed itself offers no public job-search API; HasData is an independent service that returns Indeed search results and job pages as JSON over a key-authenticated HTTPS call (details and the adapter design in SPEC §10.8). What the client should know before go-live: (a) HasData states that it reads publicly available data, that Indeed's terms may restrict automated access, and that compliance is the customer's responsibility; the client accepts that position by choosing this source. (b) Pricing is per request: 10 credits per Indeed call; the free tier gives 100 calls a month, the Startup plan about 20,000 for USD 49, Basic 100,000 for USD 99 (prices on the pricing page; the landing page quotes slightly higher figures). A trip of 50 companies costs up to 50 calls, so Startup covers roughly 400 trip runs or a mix of trips and daily Opportunity searches each month. (c) The API searches by keyword and location, not by company, so the planner will search the company name near the trip address and keep only listings whose company matches (SPEC §10.8); this and the regional `domain` value for ca.indeed.com are to be confirmed on the free tier before the plan is bought. Still needed from the client: a HasData account and API key, the plan, and the acknowledgement in (a). **Alternatives reviewed on October 25, 2026 (to discuss):** scraping Indeed ourselves is not recommended (Cloudflare bot protection, Indeed's terms and robots rules, proxy and maintenance cost, risk of blocking the office IP). Equivalent Indeed-through-a-vendor options: Apify's Indeed scrapers (about USD 2–5 per 1,000 results, roughly USD 5 of free credit a month), same compliance position as HasData. Official, free-tier sources that overlap Indeed without using it: Adzuna API (free developer key, 250 calls a day and 2,500 a month, many boards aggregated, "Jobs by Adzuna" attribution required; Canada coverage and a per-company filter to confirm), JSearch on RapidAPI (Google for Jobs, which indexes many Indeed postings; about 200 free requests a month), the Government of Canada Job Bank RSS feeds, and company career pages (poor coverage for small industrial employers). Proposed next step: a half-day, zero-cost comparison of Adzuna, JSearch, and the HasData free tier against ten known hiring companies of the client, then decide whether a paid Indeed source is needed at all. See SPEC §10.8. First live keys on November 1, 2026 (Adzuna and HasData, free plans): both answer; Adzuna's application is "pending activation" with 25 calls a day until Adzuna reviews it, its `company` filter proved unreliable so the adapter now searches the company name as an exact phrase and filters the results, and HasData's `domain` must be the full Indeed host (`ca.indeed.com`), which the adapter now derives from `ca`. With the sample trip provider the sample job source answers first, so testing on sample companies spends no budget; live Hiring counts for real companies wait for the Maps key (open question 9). Decision of November 7, 2026: Indeed through HasData is the only live source for now; the Adzuna keys were removed from the environment (the adapter stays and reads as not configured). A search now holds a group of job titles sent as one Indeed OR query, one location, and a posted-within window, with defaults under Settings → Opportunity searches (SPEC §7.14); calls, credits, HasData's live balance, and administrator alerts sit under Settings → Job listing sources with a usage card for everyone (SPEC §7.13).
11. **Lost and Disqualified leads.** Defaults built on October 21, 2026, pending the client's confirmation: the lead stays active (not archived) and keeps its owner; there is no dedicated navigation view (use the status filter); conversions still count only changes to Client; closed leads are excluded from the needs-attention reminder; Lost Lead reasons are an Admin list seeded with Pricing. Any of these can change without schema work. Related: the existing Client Response values Not Interested, Do not use Agency, and Not Hiring overlap with the Disqualified reasons; in the client's current tracker those responses are recorded with the Status still Cold, so a mapping rule for existing data is needed.
12. **Action matching rules.** Precedence when several leads match a discovered company, whether archived leads count, and how loose company-name matching may be. Lead addresses are free text and not geocoded today. SPEC §10.8 proposes defaults. Resolved in part on November 6, 2026: lead creation refuses exact duplicates (client email, website domain, phone, or company name) and warns on a similar name at the same address or an archived match (SPEC §7.15); the opportunity pool attaches listings to the matched live lead and shows closed or archived matches as history (SPEC §7.14). Precedence is the matcher's (SPEC §7.13).
13. **Legacy data import.** The client's current system of record is a spreadsheet tracker (kept outside the repository because it holds real contact data) with one row per interaction. The import script (SPEC §10.9) is built and verified on the client's workbook with these defaults, which the client should confirm: "Office" becomes a new lead type next to Road Trip; the two numbered BD-action sequences collapse into the single BD-action list with the step number kept on each timeline entry; the tracker's "Cold Call" / "Cold Email" are imported under the BRD names "First Call" / "First Email" (a switch keeps the original names); negative responses stay as responses rather than becoming Disqualified; companies on the Clients sheet get status Client; the 2021–22 archive sheet loads as archived leads; Sales Manager accounts are created from the names in the sheet (Adam's email is assumed). Remaining decision: the client confirms the defaults and the Sales Manager email addresses before the go-live run.
14. **Opportunity Recommendation sources and scheduling (BRD §25).** The module needs the same licensed job-listing access as open question 10 (Indeed has no public search API) plus career-page access that respects robots and terms. The daily run needs a scheduler that survives the standalone deployment: SPEC §10.10 proposes a separate job runner process in Docker rather than an in-request timer. Both are decisions for the client before OPP-* is scheduled. Decided on November 6, 2026 by the project owner: the first version is one shared pool, not per-person search terms; searches run two or three times a week on configurable days and time and cap the listings per source so Indeed stays inside its free credits; the run rides on the existing jobs scheduler (SPEC §7.14). Left for later: per-person terms, channel screens and reports, Find Similar.
15. **Presence and typing indicators (COLL-05).** Live refresh of the Collaboration tab is in place. Showing who is viewing a lead and who is typing needs a push channel (Server-Sent Events or WebSockets) kept open per lead; confirm whether the client wants this before the native app, since it also decides the hosting model.

16. **Pipeline board after the Pipedrive trial (§3.24).** The client looked at Pipedrive and wants its workflow feel. The project owner took a trial, drafted a "Temp Hiring Pipeline" there (New Deal, Contact Made, Qualified, Profile Shared, Meeting Completed, Negotiations started, Contract Signed, People Deployed), and decided on November 11, 2026: one pipeline for every lead type with a type filter, no deal value or forecast, the drafted stages as the columns (People Deployed is the Client status), Cold / Warm / Hot kept as a tag rather than derived from the stage. Still to confirm with the client before Phase 1 of SPEC §10.11 starts: the stage names and the BD action → stage mapping (the backfill runs once), the per-stage days and default follow-ups, whether client responses also move the stage, whether the Pipeline page becomes the Sales Manager's landing page, and the entry's name. Answered by the project owner the same night and Phase 1 built: client responses do not move the stage; the Action center stays the landing page; the entry is called Pipeline; the mapping stays editable and can be re-applied at any time (Recompute stages), so the placement is no longer a one-time step; the per-stage days and default follow-ups came with Phase 2 on November 12, 2026: the proposed days are seeded as editable rules, and the suggested next steps sit under Settings → Pipeline next steps.

---

## 8. Traceability summary

| BRD section | PRD IDs | Status |
|---|---|---|
| §2 Roles | ROLE-01..03 | Implemented |
| §3 Authentication | AUTH-01..11 | Mostly implemented; devices planned |
| §4 Action Center | AC-01..07 | Implemented |
| §5 Navigation | NAV-01..04 | Implemented |
| §6 Lead record | LEAD-01..07 | Implemented (LEAD-06..07 from the change note §8, defaults in open question 11) |
| §7 Ownership | OWN-01..06 | Implemented |
| §8 Queued leads | QUE-01..03 | Implemented |
| §9 Search/filter/archive | SRCH-01..07 | Implemented |
| §10 Notes/voice | NOTE-01..06 | Implemented (voice depends on the browser's speech recognition) |
| §11 Tasks/reminders | TASK-01..07 | Implemented except tasks created from emails (waits on the Gmail integration) |
| §12 Collaboration | COLL-01..06 | Implemented except typing indicators and presence |
| §13 Files | FILE-01..08 | Implemented except AI summaries and upload notifications |
| §14 OCR | OCR-01..03 | Planned |
| §15 Gmail | MAIL-01..09 | Partial (recent messages via connected Gmail; threads, send, summaries planned) |
| §16 Lead generation | LGEN-01..05 | Planned (preview) |
| §17 Road planner | PLAN-01..04 | Planned (preview); visits feed reports |
| Change note Oct 21, 2026 §1–7, §9 (Sales Trip Planner) | TRIP-01..11 | Implemented on sample data; live providers need keys (§3.22) |
| Change note Oct 21, 2026 §8 (lead status) | LEAD-06..07 | Implemented |
| §25 Opportunity Recommendation (updated BRD of Oct 19, 2026) | OPP-01..22 | First version built November 6, 2026 as a shared pool (§3.23 statuses per item; open question 14) |
| Change request of Nov 11, 2026 (Pipeline board, after the Pipedrive trial) | PIPE-01..13 | Phases 1–2 implemented November 11–12, 2026 (PIPE-01..10, PIPE-11 in part); PIPE-12 and the rest of PIPE-11 planned (Phase 3); SPEC §10.11 |
| §18 Targets | TGT-01..06 | Implemented |
| §19 Dashboards/reports | RPT-01..06 | Implemented; usage time pending |
| §20 User management | USR-01..10 | Implemented except devices |
| §21 List of values | LOV-01..05 | Implemented |
| §22 Notifications | NTF-01..05 | In-app and email channels, the listed events including mentions and messages, digests, and preferences implemented; push planned |
| §23 Audit | AUD-01..06 | Implemented for built features |
| §24 Non-functional | NFR-01..09 | See table |
| Appendix A Wireframes | See SPEC.md §9 | Screens A1–A5, A7, A10, A11, A13–A15 implemented; A6, A8, A9, A12 planned/preview; A16 (Sales Trip Planner) implemented |
| Appendix B Lists | §5 above | Seeded |
| Appendix C Rules | BR-01..12 | Implemented except BR-03, BR-08 |
