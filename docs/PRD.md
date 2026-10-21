# SalesTrackPro — Product Requirements Document (PRD)

| | |
|---|---|
| Source | `Sales_Tracker_App_BRD_SRS.docx`, version 1.0, dated October 13, 2026. An updated BRD/SRS (`docs/Sales_Tracker_App_BRD_SRS_Updated.pdf`) was added on October 19, 2026 and has not yet been reconciled with this PRD. The change note `SalesTrackPro_Sales_Trip_Planner_Requirement_Change.docx` (received October 21, 2026; the file stays local and untracked) is incorporated as §3.22 and LEAD-06/07 |
| PRD version | 1.1 — October 21, 2026: Sales Trip Planner (§3.22, TRIP-01..11), lead status reasons (LEAD-06/07), reference lists (§5), open questions 8–13. (1.0: October 17, 2026; reviewed October 18, 2026) |
| Companion | `SPEC.md` (technical specification and screen designs) |
| Status legend | **Implemented** — in the current codebase · **Partial** — some of the requirement is built · **Planned** — not started, depends on an external service or a later phase |

Requirement IDs are stable and are referenced from `SPEC.md`. Each requirement keeps the BRD section it came from so the two documents can be read side by side.

---

## 1. Product overview

### 1.1 Purpose

SalesTrackPro is a web (and later mobile) sales-management application for a staffing/recruitment business. It manages leads from first prospecting through client conversion, records every interaction, links client email activity, supports collaboration and tasks, offers AI-assisted summaries and guidance, manages sales targets, and gives management reporting. (BRD §1)

### 1.2 Goals

1. One system of record for leads, interactions, documents, and candidate profiles.
2. A daily "Action Center" that tells each Sales Manager what to do today.
3. Measurable activity (calls, emails, visits, leads, conversions) against per-person targets.
4. Full accountability: ownership, approvals, archive, and configuration changes are audited.
5. Admin-maintained configuration (dropdown values, roles, targets, security) without code changes.

### 1.3 Technology direction (BRD §1)

React frontend, Node.js backend, responsive web experience, Android and iPhone support, Google Workspace/Gmail integration. The current implementation is a Next.js 16 application (React 19 on the client, Node.js route handlers on the server) backed by PostgreSQL, packaged with Docker for development and production, and verified by lint, type checks, a production build, and a Selenium browser suite (SPEC §2.3 and §12). Native mobile apps are out of scope for the current phase; the web UI is responsive.

### 1.4 Phasing

| Phase | Content | Status |
|---|---|---|
| Phase 1 — Core | Roles, authentication, leads with the full field set and status reasons, ownership, queued leads, search/filter/archive, interaction timeline, tasks, documents and profiles, action center, targets, reports, user administration, list of values, audit | Implemented (see per-requirement status) |
| Phase 2 — Internal features | Collaboration threads and mentions, in-app notifications, rich-text notes, device authorization | Planned |
| Phase 3 — Integrations | Google sign-in, Gmail linking and AI summaries, voice-to-text, OCR, job-board and review data, route optimization, live map, company, and job-listing providers for the Sales Trip Planner (TRIP-*; the planner itself is built and runs on sample data until keys are set), push/email notifications | Planned; a first cut of Gmail linking (per-user read-only mailbox link, lead Emails tab) is built and waits on a Google Cloud OAuth client |

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
| AUTH-02 | Sign-in with email and password. | Correct credentials create a session; passwords are never stored in clear text. | Implemented |
| AUTH-03 | Sign-in with Google/Gmail (OAuth 2.0). | A "Continue with Google" button signs the user in when the Google email matches a pre-added account. | Planned (needs Google Cloud project and consent screen) |
| AUTH-04 | Every user can change their own password. | Requires the current password; other sessions are signed out. | Implemented |
| AUTH-05 | Forgot-password flow sends a secure reset link or code to the registered email. | Link expires in 30 minutes; the response does not reveal whether the address exists. | Implemented (dormant until SMTP is configured) |
| AUTH-06 | Two-factor authentication by OTP sent to the registered email; Admin enables and configures it per account. | After a correct password the user must enter a 6-digit emailed code that expires in 10 minutes; 5 wrong codes invalidate it. | Implemented (dormant until SMTP is configured) |
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
| NAV-02 | Items: Action Center/Home, My Leads, All Leads, Cold, Warm, Hot, Client, Queued Leads, Archive, Lead Generation, Tasks, Road Visit Planner, Dashboard/Reports, Targets/Target Templates, Admin/User Management, List of Values, Device Authorization. | Admin-only items are hidden from users without the privilege. The Sales Trip Planner (§3.22) has its own item under Tools for users with the plan_trips privilege (Admins and Sales Managers by default). | Implemented (Device Authorization opens a placeholder) |
| NAV-03 | Lead views sort by most recent activity first unless another sort is chosen. | — | Implemented |
| NAV-04 | Archive has its own search and filters. | — | Implemented |

### 3.4 Lead record and data fields (BRD §6)

**LEAD-01** (Implemented) A lead has the following fields. Required fields are marked ★.

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
| OWN-03 | Admin may reassign an individual lead or bulk-reassign selected leads. | — | Implemented |
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
| NOTE-03 | Rich text: bold, italics, lists, links. | — | Planned (plain text with line breaks today) |
| NOTE-04 | Voice-to-text for notes on computer, Android, and iPhone; transcription editable before saving. | — | Planned |
| NOTE-05 | Natural-language follow-up instructions inside notes may create tasks/reminders after confirmation. | A next-step phrase with a date in a note (or in the notes of a call, email, or visit) offers a task with the resolved date, time, and title shown for review. The task is created on save only while the offer stays ticked, and the lead's follow-up date moves to it. | Implemented |
| NOTE-06 | Calls, emails, and visits can be logged as timeline entries with a summary, notes, and the time they occurred. | These entries feed the Action Center and reports. | Implemented (extension that makes AC-02 measurable) |

### 3.9 Follow-up interpretation, tasks, and reminders (BRD §11)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| TASK-01 | Tasks can be created manually or directly from a lead (and later from notes, emails, threads). | Manual creation, creation from a lead, and creation from notes (NOTE-05) are available; emails and threads wait on Phases 2 and 3. | Partial |
| TASK-02 | Task fields: lead, title, description, assignee, due date/time, priority, status, checklist, creator, timestamps. | All present. | Implemented |
| TASK-03 | Natural-language due dates typed in notes or task fields: "follow up tomorrow", "follow up Monday", an explicit date such as "Feb/01/2026", "next week", "next month", a month name such as "January", or a period such as "six months". A month name alone resolves to the first working day of that month, subject to the business-calendar configuration. Relative periods ("six months") are counted from the date of the source interaction, not from today. | The resolved date is shown beside the field in the task form, the follow-up scheduler, and the note form before anything is saved. Month names and relative periods skip weekends and the holidays in the business calendar; weekday names are kept unless they fall on a holiday; explicit dates are kept as written. Notes count relative periods from the interaction date. | Implemented |
| TASK-04 | Task updates notify assignees; users can comment and use collaborative checklists. | Checklists implemented; notifications and comments planned. | Partial |
| TASK-05 | Remind the responsible Sales Manager when a lead has had no action for one week, based on configurable action/status rules. | "Needs attention" list on the Action Center; the number of days is an Admin setting. Rules that vary by BD action or status are not yet built. | Partial |
| TASK-06 | Daily and weekly reminders for pending/overdue activities. | — | Planned (needs notification delivery) |
| TASK-07 | Scheduling a follow-up from a lead sets the lead's follow-up date and creates a reminder task for the owner. | — | Implemented (extension) |

### 3.10 Collaboration and messaging (BRD §12)

| ID | Requirement | Status |
|---|---|---|
| COLL-01 | Lead-specific threaded messages and comment threads. | Planned |
| COLL-02 | Mentions: @user, @all, @admin, @recruiter, @salesmanager, generating in-app, email, or push notifications by preference. | Planned |
| COLL-03 | Reply, quote, edit own messages; timestamps and attribution; rich text. | Planned |
| COLL-04 | Ordinary users cannot hard-delete; Admin may soft-delete with audit history. | Planned |
| COLL-05 | Real-time updates, typing indicators, presence showing who is viewing the lead. | Planned |
| COLL-06 | Files can be referenced from messages, comments, and tasks. | Planned |

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
| MAIL-01 | Emails sent to and received from the client email addresses are linked to the lead. | Partial — the lead's Emails tab lists recent messages whose sender or recipients include one of the lead's client emails, read live from the viewer's connected Gmail (administrators: every connected mailbox). Messages are not stored per lead yet |
| MAIL-02 | The owner's mailbox is the primary mailbox; on transfer, future association follows the new owner, history is preserved. | Planned (today the viewer's own mailbox is read, not the owner's) |
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
| RPT-02 | Admin performance dashboard: summary for all Sales Managers; click a name for the individual report. | — | Implemented |
| RPT-03 | Periods: Today; Yesterday (business-day logic); This Week; Last Week; Month to Date; Last Month; Year to Date. | "Yesterday" skips weekends and the holidays in the business calendar. | Implemented |
| RPT-04 | Drill-down from charts/cards to the exact leads/activities behind each number; open the entire lead from there. | — | Implemented |
| RPT-05 | Tool engagement report for all Sales Managers and for an individual: logins, usage time where measurable, leads created/updated/converted, interactions, tasks created/completed, voice notes, documents attached, other feature usage; filters by date range, person, role/stage, and target template; graphical presentation with drill-down to supporting records. | Counts for logins, leads, updates, conversions, interactions, tasks, files are in the report with drill-down; usage time and voice notes are not measured; filters by stage and template are not yet in the UI. | Partial |
| RPT-06 | Reports exportable to PDF/Excel. | Excel (.xlsx) and CSV export implemented; PDF planned. | Partial |

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
| NTF-01 | Channels: in-app, email, mobile push. | Planned |
| NTF-02 | Events: mentions, comments, task assignment/update, lead status change, file upload, follow-up reminders, queued-lead events, ownership transfer, others configured. | Planned (all events are already recorded in the audit log and timeline, which is the source for notifications) |
| NTF-03 | Daily and weekly performance reports by role and preference. | Planned |
| NTF-04 | Daily and weekly reminders summarizing due/overdue follow-ups and tasks. | Planned |
| NTF-05 | Per-account preferences subject to mandatory Admin/security notifications. | Planned |

### 3.21 Audit and compliance (BRD §23)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| AUD-01 | Audit lead creation and updates with field-level changes. | Each update records only the changed fields with before and after values. | Implemented |
| AUD-02 | Audit ownership transfer, assignment, archive/restore, queued approval/rejection, user/role changes, device authorization, security configuration, list values, messages/comments, tasks, documents, profile uploads. | All implemented features write audit entries; messages and devices are planned. | Implemented for built features |
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
| TRIP-06 | Hiring shows the number of active job listings found for the company ("8 Jobs"); when greater than zero it opens an in-app dialog listing Job Title, Job Portal / Source, Location, Date Posted, Employment Type (when available), and a View Job link to the original posting. | Sources are supported job portals such as Indeed, subject to NFR-08 (open question 10). | Implemented against the provider contract; a licensed job source is still to be chosen (open question 10) |
| TRIP-07 | Action is computed by matching the company against existing leads and clients on company name, address, website/domain, and phone number. Values: Cold Lead, Warm Lead, Hot Lead, Client, Lost Lead – [Reason], Disqualified – Not Interested, Disqualified – Bad Timing / Not Right Now, Disqualified – No Longer Interested, Disqualified – Cannot Contact, Disqualified – Does Not Meet Criteria, New / Not in CRM. | Depends on LEAD-06. Matching rules and precedence are open question 12. | Implemented |
| TRIP-08 | The list can be filtered by Action, including combined status/reason values. | — | Implemented |
| TRIP-09 | The list can be sorted ascending or descending by any applicable column. | — | Implemented |
| TRIP-10 | Companies can be shortlisted from the results. | — | Implemented |
| TRIP-11 | The list can be exported to Excel and printed as a field-visit report, both including Company Name and Company Address, with a scope of All Results, Filtered Results, Shortlisted Companies, or Planned Visits. | Planned Visits are shortlisted companies placed on a road visit plan (PLAN-01). | Implemented; a planned visit is a date set on a shortlisted company until the road visit planner (PLAN-01) exists |

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
| NFR-07 | Accessibility-minded forms, keyboard navigation, labels, validation messages, readable contrast. | Labels, roles, and keyboard dismissal are in place; a formal audit is pending |
| NFR-08 | Integrations comply with Google Workspace and third-party terms and capabilities. | Applies to Phase 3 |
| NFR-09 | Rate limiting and brute-force protection on sign-in. | Implemented |

---

## 7. Assumptions, dependencies, and open questions

1. **Device identification.** Standard browsers cannot read a MAC address. Device authorization needs either a managed-device identifier (MDM), a native/mobile wrapper, or a registration token per browser. Decision pending.
2. **Email delivery.** Password reset, invitations, and 2FA depend on SMTP credentials that are not yet available. Until then Admins set passwords directly and 2FA cannot be enabled.
3. **Google Workspace.** OAuth sign-in and Gmail linking need a Google Cloud project, verified consent screen, and domain-wide or per-user authorization. The Gmail link is coded (per-user consent, read-only scope) and stays dormant until `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GMAIL_TOKEN_KEY` are set.
4. **External data sources.** Indeed, company careers pages, Glassdoor, and Google reviews have their own terms; the BRD scopes these to "when lawfully/technically available".
5. **Business calendar.** Resolved: Admins keep the public-holiday list under Settings → Business calendar. Weekends and listed holidays are non-working days for "yesterday" in reports, target scaling, and natural-language dates.
6. **Native mobile.** Android/iPhone support is met by the responsive web app for now; native apps (camera capture, push) are Phase 3.
7. **Usage time.** "Application usage/time where measurable" requires client-side activity tracking that is not yet defined.
8. **Sales Trip Planner baseline.** The change note of October 21, 2026 says it amends an existing Sales Trip Planner requirement and asks that previously approved requirements be preserved, but neither BRD/SRS version contains a feature of that name. §3.22 treats the change note plus BRD §16/§17 as the whole requirement until the client provides the original planner specification.
9. **Company search and distance provider.** Searching companies by address and radius needs a geocoding and places provider (for example Google Places, which needs billing and limits how long results may be cached), and the driving-minutes radius needs a routing or isochrone service on top. Business types such as "Bakery / Food Manufacturing" do not map to a single provider category and need keyword rules. Provider, budget, and terms are undecided. Status: a Google Maps adapter (Geocoding, Places Text Search, Place Details, Distance Matrix) is written behind the provider interface and used when `MAPS_API_KEY` is set; it has not been exercised against a real key.
10. **Job listings source.** Indeed offers no public job-search API and its terms forbid scraping. BRD §25 already treats Indeed as one configurable channel rather than a dependency, so TRIP-06 needs a licensed aggregator (Adzuna, SerpApi Google Jobs, JSearch, or similar) chosen and budgeted. Status: the app calls a small JSON contract (SPEC §10.8) that any licensed source can be wrapped in; nothing is wired to Indeed.
11. **Lost and Disqualified leads.** Defaults built on October 21, 2026, pending the client's confirmation: the lead stays active (not archived) and keeps its owner; there is no dedicated navigation view (use the status filter); conversions still count only changes to Client; closed leads are excluded from the needs-attention reminder; Lost Lead reasons are an Admin list seeded with Pricing. Any of these can change without schema work. Related: the existing Client Response values Not Interested, Do not use Agency, and Not Hiring overlap with the Disqualified reasons; in the client's current tracker those responses are recorded with the Status still Cold, so a mapping rule for existing data is needed.
12. **Action matching rules.** Precedence when several leads match a discovered company, whether archived leads count, and how loose company-name matching may be. Lead addresses are free text and not geocoded today. SPEC §10.8 proposes defaults.
13. **Legacy data import.** The client's current system of record is a spreadsheet tracker (kept outside the repository because it holds real contact data) with one row per interaction. Its lead type values are "Office" (87% of rows) and "Road_Trip", not Road Trip / Cold Call / Cold Email; its BD actions are two numbered stage sequences (road trip and office); its statuses are exactly Cold / Warm / Hot / Client. Decisions pending: what "Office" maps to, whether the numbered sequences return, and whether the import maps negative responses to Disqualified. SPEC §10.9 describes the import.

---

## 8. Traceability summary

| BRD section | PRD IDs | Status |
|---|---|---|
| §2 Roles | ROLE-01..03 | Implemented |
| §3 Authentication | AUTH-01..11 | Mostly implemented; Google sign-in and devices planned |
| §4 Action Center | AC-01..07 | Implemented |
| §5 Navigation | NAV-01..04 | Implemented |
| §6 Lead record | LEAD-01..07 | Implemented (LEAD-06..07 from the change note §8, defaults in open question 11) |
| §7 Ownership | OWN-01..06 | Implemented |
| §8 Queued leads | QUE-01..03 | Implemented |
| §9 Search/filter/archive | SRCH-01..07 | Implemented |
| §10 Notes/voice | NOTE-01..06 | Partial (rich text and voice planned) |
| §11 Tasks/reminders | TASK-01..07 | Partial (notifications planned) |
| §12 Collaboration | COLL-01..06 | Planned |
| §13 Files | FILE-01..08 | Implemented except AI summaries and upload notifications |
| §14 OCR | OCR-01..03 | Planned |
| §15 Gmail | MAIL-01..09 | Partial (recent messages via connected Gmail; threads, send, summaries planned) |
| §16 Lead generation | LGEN-01..05 | Planned (preview) |
| §17 Road planner | PLAN-01..04 | Planned (preview); visits feed reports |
| Change note Oct 21, 2026 §1–7, §9 (Sales Trip Planner) | TRIP-01..11 | Implemented on sample data; live providers need keys (§3.22) |
| Change note Oct 21, 2026 §8 (lead status) | LEAD-06..07 | Implemented |
| §18 Targets | TGT-01..06 | Implemented |
| §19 Dashboards/reports | RPT-01..06 | Implemented; usage time and PDF export pending |
| §20 User management | USR-01..10 | Implemented except devices |
| §21 List of values | LOV-01..05 | Implemented |
| §22 Notifications | NTF-01..05 | Planned |
| §23 Audit | AUD-01..06 | Implemented for built features |
| §24 Non-functional | NFR-01..09 | See table |
| Appendix A Wireframes | See SPEC.md §9 | Screens A1–A5, A7, A10, A11, A13–A15 implemented; A6, A8, A9, A12 planned/preview; A16 (Sales Trip Planner) implemented |
| Appendix B Lists | §5 above | Seeded |
| Appendix C Rules | BR-01..12 | Implemented except BR-03, BR-08 |
