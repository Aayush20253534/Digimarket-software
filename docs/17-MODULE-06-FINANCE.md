# Module 6: Financial categories, income and expense ledger

## Delivery
Database-backed financial operations integrated with the Module 5 approval state machine. Implemented in `apps/api/src/finance`, `apps/web/src/app/app/finance`, Prisma schema/migration, contracts and CI.

### Categories
- Organization-wide EXPENSE and INCOME categories, created and activated/deactivated by `finance.category.manage`.
- Normalized names unique per organization and kind. An inactive category stays linked to historical entries and cannot be used for new submissions.
- E.g. expense category Rapido and income category Client Retainer.

### Entries and approval
- User enters kind, category, positive decimal amount, occurredOn date, payment method, optional source/payee and notes.
- INR-only initially, matching organization.defaultCurrency. Monetary amounts stored as PostgreSQL DECIMAL(19,4), never JS floats.
- Each entry creates its own FINANCE approval request. An active Module 5 FINANCE policy must first be configured.
- Category ownership and status validated at creation. One `idempotencyKey` UUID per submit; duplicate use returns 409 to avoid double inserts.
- Requester cannot approve their own entry. Approvers must possess both a role listed in the policy snapshot, `approvals.decide` and `finance.approve`.
- Approval POSTED / REJECTED / CANCELLED changes the linked financial record inside the same PostgreSQL transaction as the approval decision, audit and outbox.
- No edit/delete route exists for submitted or posted entries. Historical entries remain immutable.
- The ledger does not automatically create a bank transfer or process a real payment.
- Generic FINANCE approvals not linked to ledger entries remain ordinary approvals without any posting.

### Summaries and exports
- `view=mine`: only user's own transactions, requires `finance.entry.read.own`.
- `view=all`: full organization dataset, requires `finance.read.all`.
- Database `groupBy` sums for posted income, posted expense, net posted, pending income, pending expense.
- PENDING, REJECTED and CANCELLED entries do not contribute to posted totals.
- All aggregation uses PostgreSQL decimal amounts and decimal arithmetic server-side. JSON amount values are fixed 4-digit decimal strings.
- Latest 200 records shown in register. CSV export limited to 5,000 records and scoped to same permissions; formula injection mitigated.
- CSV is returned as JSON content through authenticated API proxy, then downloaded by the browser; no public export URL.

### API
- GET/POST `/api/v1/finance/categories`
- PUT `/api/v1/finance/categories/:id/status`
- GET/POST `/api/v1/finance/entries`
- GET `/api/v1/finance/summary?view=mine|all`
- GET `/api/v1/finance/export?view=mine|all`

### Permissions
- SUPER_ADMIN: all finance capabilities via system permission catalog.
- ADMIN: category management, all organization finance reads, entry create, finance approval.
- FOUNDER: all organization reads, entry create, finance approval, but not category management by default.
- EMPLOYEE: own entry reads and submissions only.
- Existing organizations: run `packages/db/src/seed.ts` after migration to add new finance grants to system roles; custom roles remain unchanged.

### Testing
`.github/workflows/module6-finance.yml` uses an isolated PostgreSQL 16 service to apply and validate all migrations, run lint, typecheck, tests, builds, Playwright browser tests and finance reconciliation tests. It does not connect to live Neon.

### Dependencies and intentionally deferred work
- No receipts uploaded or exposed here. Module 9 adds private Cloudinary uploads and secure FinancialAttachment linkage. Never accept public Cloudinary URLs as proof of receipt.
- No client/project FK until corresponding modules exist. Future Module 13 creates exactly one linked posted income row per verified client payment; no duplicate revenue counters.
- No reversal/adjustment API yet. Corrections to posted records require a separate auditable reversal feature before production use.
- No multicurrency conversion, payment processor, bank synchronization, or production deployment.
- Export limit is explicit; future filtering/pagination/reporting belongs in Module 16.
