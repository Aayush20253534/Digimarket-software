# Module 7: Leads CRM

## Scope and delivery
Module 7 implements PostgreSQL-backed prospect tracking at `/app/leads`, with create/search/filter/list/detail, stage management, owner assignment, follow-up scheduling data, append-only activity, duplicate signals, CSV import/export, permissions and CI tests. These records are real; no example leads are seeded.

## Lead lifecycle
- Stages: NEW, CONTACTED, QUALIFIED, PROPOSAL, WON, LOST.
- Authorized users update stages with optimistic `version` concurrency. The server returns HTTP 409 for a stale edit.
- WON is a pipeline status, **not a client record**. Transactionally unique lead→client conversion belongs to Module 8. Never create a client merely by changing status.
- Follow-up dates are recorded with full timezone offsets and shown on lead register/detail. Automated reminders and delivery are Module 16 work.

## Security
- `leads.read`: shared basic prospect fields within the organization. Private activity and duplicate details are not supplied to read-only users.
- `leads.create`: create prospect.
- `leads.edit`: edit any in-org prospect.
- `leads.edit.own`: edit if creator or current assignee; grants no unrestricted organization editing.
- `leads.assign`: assign/reassign to **active users of the same organization**. Assignment is audited; cross-org assignees rejected.
- `leads.duplicates.review`: view and resolve possible duplicate flags (CONFIRMED/DISMISSED). **Never silently merge or delete a lead.**
- `leads.bulk`: organization CSV export / batch import. Bulk reads require both `leads.bulk` and `leads.read`; bulk imports require `leads.bulk` and `leads.create`.
- Existing default role grants: SUPER_ADMIN full; ADMIN full; FOUNDER full except restricted system administration; EMPLOYEE shared read/create and own-assigned edits. Grant changes for existing system roles are applied by rerunning the idempotent permission seeder after migration. Custom roles are not modified.

## Duplicate detection
Phone is normalized to digits (7–15 digits), and business names to case-folded, collapsed-whitespace strings. Newly created/updated leads are matched only **within the same organization**. Potential pairs are persisted once per unordered pair, with a reason and a reviewer outcome. Different international dialing conventions can create false positives or misses: human review is always required. Confirming a duplicate is only a flag and does not merge data.

## Data
- `Lead`: business/contact, optional phone, business type, location, optional website/Instagram URLs, source, stage, owner, creator, next follow-up, importKey, version, timestamps.
- `LeadActivity`: append-only system events and notes linked to an actor.
- `LeadDuplicateCandidate`: unordered pair with unique composite key, detected reason, outcome, reviewer and timestamp.
- Indexed `organizationId` queries for stages, phone/name detection, ownership, follow-ups.
- Optional links are validated as HTTP(S). No social credentials or passwords stored in this CRM.

## API
- GET `/api/v1/leads?stage=&q=&assignedToId=&limit=&cursor=` (max 100 per page)
- POST `/api/v1/leads`
- GET `/api/v1/leads/:id`
- PUT `/api/v1/leads/:id` (optimistic version)
- PUT `/api/v1/leads/:id/assign`
- POST `/api/v1/leads/:id/notes`
- GET `/api/v1/leads/assignees` (active organization staff; leads.assign)
- GET `/api/v1/leads/duplicates`
- POST `/api/v1/leads/duplicates/:id/review`
- POST `/api/v1/leads/import`
- GET `/api/v1/leads/export`

CSV imports are parsed client-side then submitted as validated JSON in batches of up to 50. Each row has a deterministic UUID importKey derived from a caller-supplied batch UUID plus row index: reusing a batch is a conflict, not a duplicate insertion. A failing row rolls back the entire batch. CSV downloads are capped at 5,000 organization leads, quote escaped and protected from spreadsheet formula injection, and export actions are audited.

## CI and caveats
`.github/workflows/module7-leads.yml` applies migrations to isolated PostgreSQL 16, runs workspace checks, browser journeys, Module 5/6 regressions and the new CRM integration smoke. The CI database is disposable and **not** production Neon.

Not in this module: client conversion, emails/SMS, autonomous follow-up reminders, Cloudinary attachments, external enrichment, production deployment, and CRM analytics beyond the list/filter.
