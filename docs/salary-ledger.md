# Founder-funded Salary system

## Purpose
DigiMarket has no connected company bank account. Salary tracks **confirmed payments that founders have actually made** to employees or founders, together with the exact founder funding account(s) used. DigiMarket records the payment; it **does not send money**, verify transfers, administer payroll taxes or calculate statutory payslips.

## Flow
1. An administrator must have provisioned active user accounts for the recipients, with the founder role assigned to actual founders.
2. Any logged-in **FOUNDER** opens Business → Salary.
3. Create one or more tracked funding accounts for each founder: UPI, cash or a named bank source. Enter the recorded opening funds (not a real-time bank integration).
4. Record credits if the founder earmarks additional funds for salaries. Credits change the recorded available funding balance but **never** create a standard agency income entry.
5. Choose the staff recipient (includes founders), payroll month, payment date, amount and payment method. Select one or more funding accounts and allocate the exact amount to each.
6. Confirm the money was already paid. The backend validates recipient and accounts belong to the same organization, checks available balances, creates **one** salary payment and its allocations, and atomically deducts each funding share.
7. The recipient can open Salary and see **only their own** recorded payments. Other employees' salaries, bank/funding accounts, founders' contributions and salary charts are founder-only.
8. If the recorded transaction is incorrect or reversed, void the payment with a reason. The original history remains immutable and balances are restored exactly once. The original entry cannot be edited silently.

## Accounting integrity
- The company salary cost is **the amount of each active SalaryPayment, counted once**. Multiple SalaryFundingAllocations describe who funded it; they are **not** additional salary expense.
- Founder expense charts use the funding allocation by **account owner**, not who clicked Save or who received the salary.
- Salaries paid to founders are not standard finance income, and personal founder funding credits are not standard finance income.
- Existing company Finance income and expense records, cash ledger, client-funded Meta Ads and approvals are untouched; Salary is a separately reconciled ledger.
- Finance shows a *separate* salary expense series and a derived operational net after salaries. The existing "Net posted" remains the original agency ledger figure. Neither is a bank balance.
- The "available balance" is a **manually recorded salary funding balance**: opening balance + credits - paid funding allocations + voided/reversed allocations. It is not linked to a bank.
- Expenses should **not** also be entered manually as ordinary Finance expense records for the same salary payment, to avoid double-counting when comparing totals.
- One company salary cost may be split between multiple founder accounts, including multiple accounts belonging to the same founder.
- Payment creation uses a unique idempotency key, exact two-decimal INR values and compare-and-swap balance deductions in a serializable transaction.
- Every payment is audit logged with the recorder; voids require a reason and retain history.
- Records cannot be reassigned across tenants. Users must be active and funders must have the FOUNDER role.
- No automatic monthly payment recurrence or bank reconciliation is claimed.

## Deploy
- Apply additive Prisma migration `20261105193000_founder_salary_ledger` using the existing production migration command. **Never reset production data.**
- Deploy matching Render backend and Vercel frontend revisions after CI.
- No new third-party API keys or environment variables are required for Salary.
- Test an example: salary ₹20,000 funded ₹12,000 from founder A and ₹8,000 from founder B. Available balances decrease by those shares; company salary total rises by exactly ₹20,000; the payee receives no finance income entry. Voiding restores both amounts.
- Test employee view and founder access restrictions using separate authenticated accounts.
