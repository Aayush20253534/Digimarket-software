# Module 14 — Client profitability and cost attribution

## Status and design
- Financial source of truth remains Module 6 posted finance entries plus Module 13 issued invoices and verified payment allocations.
- The reporting module explicitly **separates**:
  1. **Billed net**: subtotal of issued, non-void invoices by issued date (exclusive of tax).
  2. **Billed gross and tax**: reported separately from billed net, never treated as recognized revenue.
  3. **Collected cash**: verified payment allocation amounts by payment received date; excludes rejected, pending or unrelated manual income entries.
  4. **Recognized revenue**: explicitly booked earned revenue, after tax exclusion, on its own recognition date, independently of invoice issue/cash.
  5. **Direct client costs**: attributed allocations of approved POSTED EXPENSE transactions, by expense occurrence date, never pending/rejected expenses.
  6. **Contribution**: recognized revenue minus attributed posted expense. Contribution margin is null when recognized revenue is zero, not an invented percentage.
- Unallocated expense is shown as agency overhead outside client contribution. No overhead allocation is automatically inferred. These metrics are **not** statutory net profit.
- Historical profitability can change when a cost attribution is corrected. Every reallocation is audited; recognition corrections are append-only negative reversals.

## Models
- `CostAllocation`: expense-to-client splits, optional matching client Project, amount and note. Unique (expenseId, clientId). Parent `FinancialTransaction.costAllocationVersion` provides optimistic compare-and-swap concurrency control. Every update replaces the entire split atomically with total positive allocations never exceeding the original posted expense. A blank split means 100% unallocated overhead.
- `RevenueRecognition`: append-only, positive recognition against an issued invoice's **before-tax subtotal**. Invoice version CAS and serializable transactions reject exceeding the available subtotal in concurrent writes. Reversals are separate negative rows with unique original reference, never edits to the original record. No automatic recognition from issuing invoices.
- All records are organization and client scoped; project IDs must match the expense's allocated client. Historical posted transactions are not edited/deleted by cost attribution.
- Migration: `20261020030000_client_profitability`.

## Security
- Read requires both `profitability.read` and `finance.read.all`.
- Write requires both `profitability.manage` and `finance.read.all`.
- SUPER_ADMIN, ADMIN and FOUNDER have system role grants for both; EMPLOYEE does not.
- Re-run permission seeding for existing organizations after applying the migration.
- Sensitive client margin, financial CSV and expense splits are unavailable to staff lacking privileges. All API calls authenticate via the existing JWT/session system and are allowlisted through Next.js proxy.
- Audit/outbox track cost attribution, earned revenue and reversal events with no sensitive free-text descriptions in event payloads.

## API and UI
- GET `/api/v1/profitability/report?from=YYYY-MM-DD&to=YYYY-MM-DD[&clientId=UUID]`
- GET `/api/v1/profitability/export` with the same filters, returns CSV in the authenticated API JSON envelope.
- GET `/api/v1/profitability/expenses` with date filters.
- PUT `/api/v1/profitability/expenses/:id/allocations` with expense costAllocationVersion and an entire set of client splits.
- GET/POST `/api/v1/profitability/recognitions`; POST `/api/v1/profitability/recognitions/:id/reverse`.
- `/app/profitability` renders date/client comparison, key figures, cost allocation editing, explicit recognition and reversal, and CSV export.

## Verification and next steps
- `.github/workflows/module14-profitability.yml` checks schema drift, typecheck/build, PostgreSQL isolation, allocation caps, stale writes, client/project checks, explicit recognition, reversals, tax exclusion, CSV and Module 13/6 regressions.
- Baseline has no arbitrary revenue recognition estimate: finance administrators must record earned work after verifying delivery under the agency's accounting policy.
- More sophisticated accrual journals, tax-compliant accounting exports, overhead driver assignments, invoice credit notes and audited historical close are not claimed in this module.
- Live database migration, secrets, deployment and monitoring remain Module 17.
