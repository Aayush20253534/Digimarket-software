# Founder settlements and work-cycle history

## Settlement accounting

An **Internal Settlement** records an already-completed transfer from one founder to another. The authenticated sender selects an active founder recipient, an INR amount, settlement date, method, note and idempotency key.

- One settlement source row is stored, with **two equal and opposite personal clearing-account movements** projected in `FinanceMoneyMovement`: sender **−amount**, recipient **+amount**.
- Each founder sees the same source record in their own My Entries and settlement history; company income, expenses, revenue, profit, Meta Ads and operating costs are unchanged.
- Both personal opening/current balances and the salary founder-funding balance now incorporate net active settlements.
- An allowed void preserves the cancelled settlement in personal history and excludes both movements from active balances. The original transaction records remain unchanged.
- Existing active settlements are included automatically by the view migration; no destructive backfill is necessary.
- The software records a transfer but does not send money via any bank.

## Work cycles

Agency starts **22 October 2026**. Work cycles run **22nd to 21st inclusive** (the next 22nd starts a new cycle).

- **Current My Entries and Company Entries** show only current-cycle income and expenses. At the next boundary, these figures begin at zero, while the signed closing balance from the previous cycle becomes the opening balance of the new cycle.
- **Net balance remaining** comes from account opening balances plus all signed movements up to the selected cycle end, including founder settlements. It is bookkeeping, not a certified cash/bank balance.
- **Finance → Cycles** lists the current and completed cycles. Selecting a cycle shows its income, company or personal register, salary and Meta Ads expenses, settlements and balance brought forward. Entries are paginated; exports remain available through the detailed Finance screens.
- A cycle becoming historical is automatic by date. **Finance → Cycle closing** remains a separate, explicit administrative reconciliation and immutable locking step; it requires approvals, account checks and a completed period. Closing never deletes history.
- A settlement **does not reset expense/income cards** and does not close a cycle. Previous settlement-based summary cutoffs have been removed.

## Integrity

Only organization-authenticated finance readers can access cycle balances; a 'mine' balance is restricted to accounts whose owner is the logged-in user, while 'all' requires `finance.read.all`. The sender must be a founder with finance create permission; recipient must be an active founder in the same organization. Duplicate idempotency keys are rejected.

Creating or voiding a settlement uses the shared finance advisory transaction lock and closed-period checks. Historical closed cycles cannot be silently revised.

The settlement view adds no agency expense or revenue records. Personal and company account totals reconcile because the net of each founder-to-founder movement is exactly zero.
