# Finance pages and reconciled ledgers

The Finance landing page now contains small totals and navigation cards. Income and Expenses open category cards; selecting a category opens a filtered transaction page. Meta Ads, client ad funds, money accounts, transfers, founder settlement history, agreement projections, category management and cycle closing each have their own page. Dates and personal/agency visibility follow navigation.

## What each figure means

| Figure | Source | Treatment |
| --- | --- | --- |
| Net operating money | Posted income minus Total expense | Includes ordinary expenses, self and client Meta Ads, and salaries once. Transfers and client fund movements are excluded. |
| Total expense | Every posted expense plus paid salaries | Opens a combined register with search, type filters, pagination and matching CSV export. Reversals reduce totals in their recorded cycle. |
| Consolidated expenses | Ordinary posted expenses plus salaries | Salary is counted once, with a separate subtotal and link to payroll. |
| Client ad funds | Opening funds + actual top-ups − refunds − posted client ad spend + reversals | Deposits are not service revenue. A negative balance may be missing funding or an agency advance still owed by the client. |
| Money account balance | Verified opening balance + signed source movements | Cash, bank, UPI and founder clearing accounts carry forward between cycles. |
| Founder clearing | Money received for the agency minus spending paid personally, plus reimbursements/transfers | Negative means the agency owes the founder; positive means the founder holds agency money. |
| Founder settlement notes | Existing private internal-settlement records | Informational; actual reimbursements must be recorded as account transfers. |
| Agreement projections | Contract rates overlapping selected dates | Forecasts only, excluded from posted cash and income. |

## Initial cleanup

The existing **Expenses** card retains its previous subtotal (agency expenses, including self Meta Ads, plus salaries). **Total expense** adds client spending and is the figure subtracted from posted income on the overview. In My entries, salaries use only the founder's funded share; Agency counts each payment once regardless of funding splits. Non-founder finance readers see daily salary aggregates without individual recipients or notes. Search/type filters narrow the combined register and CSV, while its summary continues to show the full selected cycle.

1. Create each real account once under **Accounts & transfers**. Use a verified balance immediately before its opening date's transactions. For the first cycle, opening on 22 October means the balance before 22 October's entries. Do not include those entries in the opening balance again.
2. Open **Assign existing records** and link each posted transaction to the account actually used. Founders also assign the source of every salary funding allocation. The submitting user is not assumed to be the source account.
3. Record genuine client advertising receipts and refunds under **Client ad funds**. Review any receipt previously recorded as service income before entering it again, to avoid counting cash twice. No funding is fabricated from historical ad spending.
4. Record completed bank/cash/founder movements in **Transfers**. Existing informational settlement notes are preserved and are not automatically converted into money transfers.
5. Reconcile the last day of the cycle against bank statements, cash counts and confirmed founder balances. Differences remain visible and block closing; the software does not manufacture adjustments to force a match. Explain any verified client advance still outstanding in the closing note and explicitly acknowledge it.
6. Close cycles consecutively. The first is 22 October through 21 November, closing at the start of 22 November. Closing requires resolved approvals, assigned source accounts, matching reconciliations and confirmation of outstanding client balances. A cycle cannot close before its last day is complete.

Account names/opening balances can be corrected with an audit reason while the opening cycle is open. Opening dates cannot move past existing transactions. These corrections require a fresh reconciliation if they change the balance.

## Corrections and protections

- A close stores an immutable snapshot. Database triggers protect historical records, dates, salary allocations and reconciliation records. Closing and posting share an organization transaction lock, so a concurrent write cannot slip through a stale reconciliation.
- Finance entries, client-fund movements, transfers and founder-only salary payments support one full reversal in an open cycle, dated on or after the original. The source record remains intact; record any replacement separately. Reversals and their originals cannot subsequently be edited or reassigned.
- Assign source accounts before reversing historical entries. Linked verified billing receipts or project cost allocations must be resolved through their original workflow first; this change does not silently rewrite billing or project profitability.
- Individual salary movements and salary account assignment remain founder-only. Other authorized finance readers see daily aggregate salary cash movements.
- Category purpose is stored independently from the display name. The migration classifies existing Meta Ads names once; renaming no longer changes ad-report inclusion. New categories choose their purpose explicitly.
- The transaction register uses server pagination/search. Its CSV uses the same date, visibility, scope, category, status, type and search filters, without the former 5,000-row truncation. A repeatable-read export keeps pages consistent.

## Deployment and verification

Apply `20261117160000_finance_accounts_and_cycles` before serving the updated API. Deploy API and web from the same commit. The migration preserves amounts, original transaction dates and existing histories; it adds account/funds/close records and backfills category purpose. It does not connect to a bank or import production balances.

Validation includes migration deployment/schema drift checks, the existing finance/salary/settlement integration suites, a new PostgreSQL ledger suite (including 5,001-row export, role/tenant boundaries, concurrent close/post and all reversal sources), and browser coverage for cards, pagination/search/export, funds, reconciliation and closing. Run the ledger suite only against an isolated `digimarket_ci` database:

```sh
pnpm --filter @digimarket/api exec tsx src/finance/ledger.integration-smoke.ts
```

The operational cleanup still needs real statements and receipts. No existing production transaction was reassigned, deleted, or guessed by this implementation.
