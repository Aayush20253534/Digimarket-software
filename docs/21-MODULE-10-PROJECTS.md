# Module 10: Project management, milestones, deliverables and project review

## Delivery inventory
- Organization-scoped project board at `/app/projects` with status filtering, pagination and search.
- Every project belongs to one existing non-archived client, with server-enforced organization access.
- Project creator is automatically a manager. Admins/founders can assign active in-org users as MANAGER, CONTRIBUTOR or REVIEWER.
- Employee project reads are limited to creator/membership. Project files are subject to the Module 9 asset access rules.
- Project milestone lifecycle OPEN → DONE; DONE requires at least one approved linked deliverable.
- Versioned deliverables can reference milestones and client-owned active Cloudinary assets; cross-organization or other-client assets are rejected.
- Authorized contributors submit deliverables to the existing DELIVERABLE approval policy.
- Approval decisions atomically change IN_REVIEW into APPROVED, CHANGES_REQUESTED or DRAFT (on cancellation); audit and outbox changes share the database transaction.
- Approved deliverables requiring edits return to DRAFT with a new revision; previous approval does not grant authority to the updated revision.
- COMPLETED requires at least one deliverable, every deliverable approved, and no OPEN milestones. ARCHIVED prevents ordinary writes.

## API
- GET/POST `/api/v1/projects`
- GET `/api/v1/projects/assignees`
- GET/PUT `/api/v1/projects/:id`
- POST `/api/v1/projects/:id/members`
- POST `/api/v1/projects/:id/members/:userId/remove`
- POST `/api/v1/projects/:id/milestones`
- PUT `/api/v1/projects/:id/milestones/:milestoneId`
- POST `/api/v1/projects/:id/deliverables`
- PUT `/api/v1/projects/:id/deliverables/:deliverableId`
- POST `/api/v1/projects/:id/deliverables/:deliverableId/submit`
- Existing `/api/v1/approvals` request/decision endpoints apply to submitted deliverables.

## Permission policy
- `projects.read`: organization-wide for managers with `projects.assign`, otherwise membership/creator only.
- `projects.create` plus `clients.read`: create projects for active, visible clients.
- `projects.update`: manage project status/milestones, constrained by management access.
- `projects.assign`: assign members and see basic active organization staff names.
- `projects.deliverables.write`: author/revise/submit for own team projects, not arbitrary organization projects.
- `projects.review` plus `approvals.decide`: decide permitted project reviews, with policy-role snapshot, member reviewer/manager or organization project manager, and no self-approval.

## Verification
`.github/workflows/module10-projects.yml` migrates an isolated PostgreSQL 16 database, checks Prisma drift, lint, types, tests and build, then tests project scope, membership, optimistic versions, milestone completion, asset linkage, review rejection/revision/re-approval and immutable audit/outbox records.
No live Neon project, Cloudinary account or agency user database is provisioned here.

## Limitations and future modules
- Module 11 adds tasks, assignments and recurrence.
- Module 12 adds content-calendar entries, publishing records and versioned content approvals.
- Module 16 adds project dashboard metrics, notifications and global search.
- Module 17 performs production deployment, security audit, backup, restore and monitoring.
- Admin should configure DELIVERABLE approval policy before staff submit reviews.
