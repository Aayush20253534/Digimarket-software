# Acceptance criteria and verification plan
**Module 0 deliverable:** tests are specified below; they have not yet run because the repository does not contain an application.

## Module 0 documentation acceptance
- [x] Covers original requirements: userwise and shared finance, admin categories, real-time totals, leads, client records, daily tasks, founder responsibilities.
- [x] Includes agreed expansion: project management, content calendar, invoices/payments, approval workflow, Cloudinary file manager, client profitability, recurring tasks.
- [x] Single-source-of-truth and cash-vs-revenue rules explained.
- [x] Role permissions and client credential storage strategy defined.
- [x] Database relationships, route inventory, API conventions and wireframes documented.
- [x] 0–17 module dependency roadmap with implementation gating defined.
- [ ] Product-owner confirmation of unresolved business/tax/approval defaults; not required for completing architecture draft, but mandatory before relevant production workflows.

## ID / Authorization
- Given disabled user account, when login/refresh/API attempted, then request denied.
- Given employee lacking finance.read.all, when requesting company totals, then 403 or appropriately hidden.
- Given a task assignee, when guessing another client's private asset ID, then file access forbidden.
- Given two organizations (test fixtures), cross-organization data never appears in detail/list/search/events.
- Password never returned by API, logged or reversible; reset revokes prior sessions.
- MFA checked for privileged role when enabled/required.
- User creation is admin-only; no public signup route.

## Finance / approvals
- Expense entered with decimal 185.00 INR / merchant Rapido / Transport category persists exactly.
- Pending expense visible to creator and designated approver, excluded from posted totals.
- Approver with permission resolves one submission exactly once; second concurrent resolution conflicts/idempotently returns result.
- Employee cannot approve own submission under default policy.
- Reversal creates linked auditable record; underlying history retained.
- Posted income and expenses yield same organization sum from ledger and dashboard after cache refresh.
- Reports filter by date in selected business timezone and by user/category/client/project.
- A receipt attachment cannot be opened without record-appropriate access.

## Leads / clients
- Two users can add/view shared leads subject to permissions.
- Follow-up event creates actor/time history and next-action information.
- Identical normalized phone shows possible duplicate, without silent merge.
- Two simultaneous conversions of one lead create exactly one linked client.
- Client archive does not erase invoice or payment history.
- Client account credentials not returned by general client API response.

## Projects / tasks
- Project links valid client, owner, members, milestones and deliverables.
- Unauthorized user cannot edit project or view confidential project asset.
- Deliverable needs appropriate approval before accepted/completed state.
- Task shows owner/assignee, due date, priority and progress.
- Repeat execution of same recurrence job yields exactly one Task row per intended occurrence.
- Recurrence with Asia/Kolkata local time generates expected daily/weekly/monthly occurrences.

## Content
- Calendar displays correct user-local day for UTC-backed timestamps.
- Draft, review, request changes, approved, scheduled and published stages enforced.
- Major edit after approval requires a new review (not silently kept approved).
- Published status requires explicit manual confirmation and is not inferred from schedule time.
- Asset links use Cloudinary metadata and permission-scoped delivery.

## Invoices / payments
- Invoice number unique per organization and totals match line items, tax and discounts.
- Issuing invoice does not increase received cash.
- Partial payment reduces outstanding by verified allocated amount only.
- Two concurrent allocations cannot make remaining balance negative.
- Repeating verify/payment callbacks does not create duplicate finance income.
- Multi-currency allocation refused until conversion rules are designed.
- Issued invoice line items cannot be silently overwritten.

## Client profitability and reporting
- Attribution of direct project expenses matches expense client/project links.
- Report separately labels recognized revenue, receipts, unpaid invoices and contribution.
- Overhead allocation is off by default and, if enabled, includes its method.
- Redis cache flush or loss does not change final ledger-backed amount.
- Viewer never sees metrics outside granted reporting permissions.

## Assets / security
- Restricted invoice or client raw file URL without authorization is unusable.
- Signed upload intent limits type, size and target scope; confirm verifies provider metadata.
- User cannot upload/link a file to another client's record without permission.
- Deleted/archived files cannot break retained issued invoice references.
- Sensitive values excluded from logs, search and SSE payload.
- Controlled restore of database backup succeeds during release readiness.

## UI/accessibility
- All forms support visible labels and inline validation.
- Lists have loading/empty/error views and keyboard usable filters/pagination.
- Mobile narrow viewport has navigable drawer and no inaccessible finance buttons.
- Unauthorized page shows access denied rather than exposing hidden data.
- Request failure does not render success toast or mutate optimistic financial totals as confirmed.

## Proposed verification commands (to implement in Module 1)
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm test:integration
- pnpm test:e2e (when the UI/E2E harness is ready)
These are contract expectations only; no executable package exists in Module 0.

## Ship / no-ship policy
No module marked implemented until actual code, migrations, access-control checks, tests and commit are verified. Do not interpret design-complete as production-ready.
