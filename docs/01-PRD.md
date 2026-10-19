# Product requirements document (PRD)
**Version:** 1.0 | **Scope:** Modules 0–17 | **Target:** internal agency deployment

## Product principles
1. Single company workspace; one source of truth per business entity.
2. Shared operational data, least-privilege finance and credential access.
3. Every state change has an actor, timestamp and audit event.
4. Approval and payment statuses never imply cash settlement without evidence.
5. Plan social content and record publication; publishing integrations can be added later.
6. Work correctly with multiple employees editing from different devices.

## Functional requirements by domain
### ID — Identity and team
- ID-01: Only admin-authorized staff can have accounts; unique login identifier and contact address.
- ID-02: Admin issues temporary credentials through an approved channel; staff change password at first sign-in.
- ID-03: Passwords hashed using Argon2id; short-lived JWT access tokens; rotated revocable refresh sessions.
- ID-04: Super Admin can disable a user and revoke sessions immediately.
- ID-05: RBAC policies enforced on every protected API; explicit per-record checks for sensitive actions.
- ID-06: Admin manages team membership; founder profiles describe responsibilities independently of permissions.

### FIN — Company finance
- FIN-01: User can submit expense with amount, currency, date, merchant, category, note, payment account/method, optional project/client and receipt.
- FIN-02: User can submit income with source, amount, category, received date, optional client/project and supporting document.
- FIN-03: Admin manages categories; category and merchant are separate concepts (example: Transport / Rapido).
- FIN-04: Configured approval state determines which submitted amounts enter finalized aggregates.
- FIN-05: Personal view filters by submitter; organization view requires finance read scope.
- FIN-06: Reports support date, type, person, category, client/project and status filters, CSV export and clear reconciliation.
- FIN-07: Corrections are traceable through adjustment/reversal records, not unlogged destruction.
- FIN-08: Financial metrics explicitly distinguish cash movement, recognized revenue, receivables and contribution/profit.

### CRM — Leads
- CRM-01: Shared lead entry includes business/contact names, phone, business type, location, links, source and notes.
- CRM-02: Lead stages: NEW, CONTACTED, QUALIFIED, PROPOSAL, WON, LOST; optional custom stage metadata later.
- CRM-03: Track assigned owner, activity history, next follow-up and reminders.
- CRM-04: Detect possible duplicate phone/business profiles; authorized user can resolve duplicates.
- CRM-05: WON conversion creates one linked client without duplicate records, using an idempotent operation.
- CRM-06: Lead import/export is permission-bound and logs bulk actions.

### CL — Clients
- CL-01: Client record stores legal/display name, contacts, business type, social links, services, contract information and status.
- CL-02: Client has linked projects, files, tasks, invoices, transactions and activity history.
- CL-03: Client credential access favors official delegated permissions; no plaintext passwords in CRM columns.
- CL-04: Archive behavior preserves historical invoices/payments and audit logs.

### WF — Approval framework
- WF-01: Submit, approve, reject and request changes with comments and actor history.
- WF-02: Policies can target expense, income, deliverable, content or other supported request type.
- WF-03: Only authorized approvers can make decisions; avoid self-approval unless explicitly permitted by policy.
- WF-04: Concurrent approvals use atomic state transitions; repeated requests are idempotent.

### AST — Asset library
- AST-01: Authorized user uploads media/document via server-scoped Cloudinary upload signature.
- AST-02: Agency/client/project logical folder hierarchy and searchable tags.
- AST-03: Store Cloudinary public_id, resource_type, delivery type, asset_id, size, format, version and permissions in Neon.
- AST-04: Restricted content uses authenticated delivery and server-controlled, short-lived access links.
- AST-05: Support asset revisions, logical archival and cleanup jobs, with audited deletion authorization.

### PRJ — Projects
- PRJ-01: Project belongs to client; optionally has responsible owner, members, service, budget and timeline.
- PRJ-02: Support milestones, tasks, deliverables, attachments and comments.
- PRJ-03: Project states: PLANNED, ACTIVE, ON_HOLD, IN_REVIEW, COMPLETE, ARCHIVED.
- PRJ-04: Deliverable approval connects to generic approval workflow.

### TASK — Work
- TASK-01: Assign tasks to staff with priorities, due dates, comments, checklist and optional project.
- TASK-02: Admin can assign shared or multiple-assignee tasks subject to permissions.
- TASK-03: Task states: TODO, IN_PROGRESS, BLOCKED, IN_REVIEW, DONE, CANCELLED.
- TASK-04: Recurrence rules generate distinct task occurrences in user's local business timezone.
- TASK-05: BullMQ retries must not generate duplicate task occurrences.

### CONT — Content calendar
- CONT-01: Create entries with client, platform, format, publish-at time, owner, caption, hashtags and assets.
- CONT-02: Provide monthly/weekly/list views, client filtering and draft/review/approval cycle.
- CONT-03: Content states: IDEA, DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED, SCHEDULED, PUBLISHED, CANCELLED.
- CONT-04: Published state initially manually recorded with author, time and optional published URL.
- CONT-05: Major content revisions re-enter approval as dictated by policy.

### BILL — Invoices and payments
- BILL-01: Produce uniquely numbered invoice for client, billing identity, line items and currency.
- BILL-02: Track draft, issued, void and paid/partially-paid/overdue derived states.
- BILL-03: Record verified payment amounts and references; associate a payment with one or more invoices through allocations.
- BILL-04: Invoice PDF saved privately to Cloudinary; authorized retrieval only.
- BILL-05: Issued invoices can be adjusted with credit note/reissue policy, not silent mutation.
- BILL-06: Recurring billing schedules generate drafts idempotently.
- BILL-07: Do not count invoice issuance as cash received or double-count verified payments.

### BI — Analytics and notifications
- BI-01: Dashboards for company, finance, lead conversion, projects, content and team workload.
- BI-02: Client performance tracks invoiced, collected, recognized revenue and attributable direct costs separately.
- BI-03: Contribution = recognized revenue minus attributable direct costs; overhead allocation optional and explicitly labeled.
- BI-04: Privileged financial details are not exposed in shared task notifications.
- BI-05: Live UI updates use SSE; if disconnected, the client refetches authoritative state.
- BI-06: Notifications cover follow-ups, task deadlines, pending approvals and outstanding invoices.

## Nonfunctional requirements
- NFR-01: All endpoints authenticated except login, controlled refresh and liveness endpoints.
- NFR-02: All create/update endpoints validate server-side input with Zod and enforce scope.
- NFR-03: Pagination and indexed filtering for all shared list APIs.
- NFR-04: Cross-request concurrency, financial precision, timezone and retries are tested.
- NFR-05: Avoid arbitrary disclosure of client data through file URLs, logs, caches, search or errors.
- NFR-06: WCAG 2.2 AA as accessibility target; keyboard and mobile usable.
- NFR-07: Backups, migrations, observability, incident procedure before production.
- NFR-08: No hard-coded example data in production analytics.
- NFR-09: Network failures and duplicate user submissions do not silently lose or duplicate critical transactions.

## User acceptance journeys
1. Admin creates employee → employee changes password → sees permitted dashboard.
2. Employee logs Rapido travel expense → approver reviews → authorized company summary updates.
3. Employee adds a local lead → another employee records follow-up → lead converts to client exactly once.
4. Client project created → tasks assigned → assets uploaded → deliverable approved.
5. Content idea linked to client → creator attaches video → reviewer requests changes → content approved → manual published entry.
6. Invoice issued → partial payment recorded → receivable correctly decreases → client contribution report reflects recognized revenue and linked direct costs.
7. Monthly recurring task runs → worker retries safely → only one intended occurrence exists.

## Terminology
- **Expense** = cash/outflow or cost entry with status; not necessarily paid invoice.
- **Income** = inflow classification; distinguish client receipts from other income.
- **Net cash movement** = verified cash inflows minus verified cash outflows in period, excluding noncash events.
- **Profit** = income/revenue less recognized costs per stated method.
- **Client contribution** = client-recognized revenue less attributable direct costs before overhead.
- **Merchant** = counterparty for transaction (e.g. Rapido), not an accounting category.
