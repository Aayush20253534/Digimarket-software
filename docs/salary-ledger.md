# Founder-funded Salary system

## Purpose
DigiMarket has no connected company bank account. Salary tracks **confirmed payments that founders have actually made** to employees or founders, together with the exact founder funding account(s) used. DigiMarket records the payment; it **does not send money**, verify transfers, administer payroll taxes or calculate statutory payslips.

## Flow
1. An administrator must have provisioned active user accounts for the recipients, with the founder role assigned to actual founders.
2. Any logged-in **FOUNDER** opens Business → Salary.
3. Create one or more funding source labels for each founder (UPI, cash or named bank). The available funding pool for every source belonging to that founder is linked to the **same Finance Net posted remaining amount**. The labels do not create independent spendable balances.
4. Record founder-attributed receipts or expenditure in Finance. Posted Finance activity immediately changes the remaining amount available for salary funding. Manual salary opening balances and top-ups are disabled. Historical manually entered salary credits remain auditable but do not create available funds.
5. Choose the staff recipient (includes founders), payroll month, payment date, amount and payment method. Select one or more funding accounts and allocate the exact amount to each.
6. Confirm the money was already paid. The backend validates recipient, funding accounts and each founder\'s **aggregate salary split** against their live remaining posted Finance amount inside a serializable database transaction. It creates **one** salary payment and its allocations. The resulting Finance Net posted reflects the salary deductions exactly once.
7. The recipient can open Salary and see **only their own** recorded payments. Other employees' salaries, bank/funding accounts, founders' contributions and salary charts are founder-only.
8. If the recorded transaction is incorrect or reversed, void the payment with a reason. The original record remains in history; it stops counting toward salary deductions and Finance Net posted updates automatically. The original entry cannot be silently edited.

## Accounting integrity
- The company salary cost is **the amount of each active SalaryPayment, counted once**. Multiple SalaryFundingAllocations describe who funded it; they are **not** additional salary expense.
- Founder expense charts use the funding allocation by **account owner**, not who clicked Save or who received the salary.
- Salaries paid to founders are not standard Finance income. Old salary top-ups do not count as Finance income or available funding.
- Existing Finance income/expense rows are not rewritten. The salary adjustment is computed from salary records and integrated with Finance Net posted. Client-funded Meta Ads stay deducted according to the current Finance rules.
- **Finance Net posted = posted agency income - posted agency expenses - posted client Meta Ads spend - PAID salary funding.** For My entries, salary funding means the allocations owned by the logged-in founder. For Agency totals, all PAID salaries are deducted once. The API also exposes Net before salaries for comparison. Neither balance is an actual bank balance.
- A founder\'s Salary available balance is **that founder\'s posted Finance net before salaries minus all active salary allocations funded by the founder**. Sources are labels for the actual founder account that made the payment, not independently bank-reconciled wallets. Multiple sources for one founder always share the same remaining Finance pool.
- Expenses should **not** also be entered manually as ordinary Finance expense records for the same salary payment, to avoid double-counting when comparing totals.
- One company salary cost may be split between multiple founder accounts, including multiple accounts belonging to the same founder.
- Payment creation uses a unique idempotency key, exact two-decimal INR salary values and a serializable transaction that rechecks the shared founder Finance pool, including simultaneous allocations from different sources owned by one founder.
- Every payment is audit logged with the recorder; voids require a reason and retain history.
- Records cannot be reassigned across tenants. Users must be active and funders must have the FOUNDER role.
- No automatic monthly payment recurrence or bank reconciliation is claimed.

## Deploy
- The original salary migration `20261105193000_founder_salary_ledger` must already be applied. This Finance-link change needs **no new database migration** and preserves all historic salary and Finance entries. **Never reset production data.**
- Deploy matching Render backend and Vercel frontend revisions after CI.
- No new third-party API keys or environment variables are required for Salary.
- Test: posted Finance income of ₹12,000 for founder A and ₹8,000 for founder B; record a ₹20,000 salary allocated between them. Both founders\' Finance Net posted must become ₹0, company salary cost must count ₹20,000 once, and the recipient does not receive a Finance income entry. A later posted Finance receipt/expense immediately changes the founder\'s Salary remaining balance. Voiding restores the salary-funded part without manufacturing a Finance income or salary credit.
- Test employee view and founder access restrictions using separate authenticated accounts.
