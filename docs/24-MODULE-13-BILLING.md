# Module 13 — Invoices, verified payments and recurring billing

## Implemented
- Organization-isolated invoice drafts, seller and buyer snapshots, lines, notes, due date, decimal quantities/prices and optional issuer-supplied tax rates.
- Drafts can be edited with optimistic versions. Issued lines, seller snapshots and amounts cannot be silently changed. Unique sequential organization invoice numbers are allocated at issue within a SERIALIZABLE database transaction. A void is permitted only before any verified collection, and issued numbers are never reused.
- Invoice statuses: DRAFT, ISSUED, VOID. Derived balances: UNPAID, PARTIALLY_PAID, PAID and OVERDUE from verified allocations only, not from user-entered status labels.
- Validated payment receipt with a unique method/reference and idempotency key. One payment can allocate to several same-client issued invoices; amounts must sum exactly to payment total. A receipt remains PENDING, without ledger effects, until a **different** qualified verifier confirms it.
- Verification requires `payments.verify`, `finance.approve` and an active FINANCE approval policy matching the verifier's system role. Atomic SERIALIZABLE verification increments invoice balances, creates one approved FINANCE approval request with decision, one posted income FinancialTransaction, updates Payment and persists audit/outbox events. This is the **existing** finance ledger, not a second revenue total. Over-allocation is rejected and serializable retries/unique constraints prevent duplicate posting.
- Separate PaymentAllocation rows link one receipt to one or more invoices. Payment rejection does not change invoice receivables or posted income.
- An authenticated `GET /api/v1/invoices/:id/pdf` returns a base64 PDF rendered from the immutable issued invoice snapshot, with no public URL and a download audit event. Multi-page formatting and textual fallback use PDF-lib.
- Monthly, quarterly and yearly recurring billing templates persist in PostgreSQL. The existing BullMQ worker checks due schedules every minute, creates a DRAFT (never issues or posts income) and advances the schedule cursor atomically. Database uniqueness on `(scheduleId,scheduledFor)` prevents duplicates.
- `/app/billing` provides invoice creation, issuance, PDF download, receivables, verification queue, single-invoice payment recording and recurring schedule controls. Multi-invoice allocations are available through the authenticated API.

## API
- GET/POST `/api/v1/invoices`
- GET `/api/v1/invoices/receivables`
- GET/PUT `/api/v1/invoices/:id`
- POST `/api/v1/invoices/:id/issue`, `/void`
- GET `/api/v1/invoices/:id/pdf`
- GET/POST `/api/v1/payments`
- POST `/api/v1/payments/:id/verify`, `/reject`
- GET/POST `/api/v1/billing-schedules`
- PUT `/api/v1/billing-schedules/:id` (pause/resume)
- Existing FINANCE `ApprovalRequest` and `FinancialTransaction` models remain the financial source of truth.

## Security and accounting controls
- INR amounts use Decimal(19,4), not JavaScript floats.
- Payment reference uniqueness is per organization and method. All invoices, payment references and category IDs are org/client validated.
- A ledger entry is uniquely linked to its Payment. The ledger status is POSTED only after independent verification. Invoice issue does not count as cash income.
- Finance policy must be configured. Staff with no invoice permissions cannot access PDF or sensitive payment records.
- User-entered seller identity, tax rates and buyer fields are **not** a substitute for legal/tax validation. Issuers must confirm invoice compliance; tax percentages are calculations, not a claim of GST compliance.
- Issued-invoice corrections and credit notes require a separate explicit policy; Module 13 prevents silent mutation, supports void only if unpaid.
- PDF generation is private and authorized, but **Cloudinary archival persistence is not wired**. Module 17 should configure private persistent PDF storage and controlled retention, plus recovery/monitoring.
- Payment gateway reconciliation and automatic social posting are outside scope.

## QA
- `.github/workflows/module13-billing.yml` validates migration drift, full lint/test/type/build, invoice PDF signature, issue/void immutability, cross-org isolation, partial and multi-invoice allocations, verifier separation, duplicate protection, full ledger reconciliation and recurring draft idempotency.
- New grants are added to system role templates. Existing organizations must rerun idempotent permission seeding after migration.
- Production infra (live Neon, Cloudinary, Redis, Render/Vercel) is still part of Module 17.
