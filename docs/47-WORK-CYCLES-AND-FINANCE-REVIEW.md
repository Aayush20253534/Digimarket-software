# Work cycles, lead cleanup and finance review

Agency start: **22 October 2026**. The first cycle is **22 October → 22 November**, then **22 November → 22 December**. Start is inclusive; closing date is exclusive. The date inputs therefore show 22 October **through 21 November**. The closing 22nd is counted exactly once in the next cycle. Timestamp reports follow Asia/Kolkata; PostgreSQL DATE fields retain their recorded business date.

## Implemented

- Shared cycle calculation and controls for Finance, payroll, business reports, lead analytics, dashboard insights, financial drilldowns, CSV exports and monthly Meta Ads groupings. Current cycle is the default; prior cycles and custom dates remain accessible. Since-start begins on 22 October 2026.
- Finance API date filters apply before register/export limits, including salary allocations and internal-settlement history. All summary cards follow the selected cycle. Settlement timestamps no longer override the period chosen in the UI.
- Agency operating net (posted agency income − ordinary agency expenses − paid salary cost) is separate from net after client ad outflows. Neither is a reconciled bank balance. Pending transactions and contract projections remain separate.
- Video, regular-post and festival-post stock displays use work cycles. Full contract weeks belong to the cycle containing the week's start date; they are not split or duplicated. Stored calendar-month/week keys, versions and carry-forward inventory are preserved. Client agreement dates and original transaction dates are not rewritten.
- Founder/admin bulk lead deletion supports explicit selections of up to 100 leads across pages, a confirmation showing the selection count, server-side organization/role checks, a transaction, deterministic locking and optimistic versions. A stale or missing selection rejects the entire batch. Converted clients survive; every lead deletion is audited. Changing a filter clears the selection.
- Tasks navigation and API registration are commented out. Task pages display a pause notice, task search/report contributions are suppressed, and both API/worker recurrence and overdue alerts are paused. Schema, implementation, history and recurrence definitions remain. Client deliveries remain active.

## Finance findings and the remaining cleanup

This is a source-code review, not verification of production transactions or bank statements.

| Finding | Present behavior / fix | Remaining work |
| --- | --- | --- |
| Calendar months, lifetime totals and settlement resets produced incomparable figures | The selected cycle now governs Finance, payroll, Reports and exports. Internal balances used to approve salary funding still carry forward across cycles. | Reconcile old transactions against receipts before closing the first cycle. |
| The old “Net posted” mixed agency results with client advertising cash outflows | Explicit operating-net and after-ad-outflow figures now identify the two calculations. | Record client ad receipts/top-ups and refunds in a separate client-funds ledger, then calculate each client's available ad funds. The existing model records spend but cannot establish the client's funded balance. |
| Salaries are stored separately from ordinary transactions | Finance includes salary cost once. Salary has its own report; ordinary expense drilldowns intentionally exclude it. | A consolidated expense report should show ordinary expenses + salaries, with a clear subtotal for each and links to its source records. |
| Founder balances represent attributed entries, not money held in a specific bank or cash account | Current balances remain cumulative so monthly rollover does not erase available funding. Internal settlements remain informational. | Introduce explicit cash/bank/UPI accounts and transfer entries; reconcile opening + inflows − outflows to actual statements. |
| Meta Ads classification depends on category names | Existing category matching is retained to avoid silently reclassifying historical entries. | Replace text matching with a stable category purpose field, then audit and migrate existing categories. A category rename can currently affect ad-report inclusion. |
| Register searches cover the latest 200 records | Date filtering now happens before the limit, and the page states the limit. Full date-range exports are available up to 5,000 records. | Add server-side pagination and search so register results and exports can use identical filters at any data volume. |
| Monthly records remain editable | Existing audits and optimistic checks are retained. No production data was changed by this code update. | Add period closing with a reconciliation checklist, then use adjustment/reversal records for corrections in closed cycles. |

## Re-enabling Tasks

Set `TASKS_ENABLED` in `packages/contracts/src/business-period.ts` to true, restore the commented API import/registration and navigation entries, and redeploy API, web and worker. The worker recreates its recurrence scheduler; existing task data is retained. The preserved Tasks/recurrence service tests can continue testing its implementation while the user-facing routes are paused.

## Dependency validation

The build flagged the existing Next.js 16.4.2 version. This change updates it to 16.4.6, which includes the [November security fixes](https://github.com/vercel/next.js/releases/tag/v16.4.5). A broader dependency audit still reports advisories in the existing toolchain (including Vitest/Tinypool) and body-parser; this is not a full dependency security remediation.
