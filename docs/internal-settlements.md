# Internal Settlement, Finance My Entries

Internal Settlement records an **informational founder-to-founder movement**, without modifying DigiMarket's accounting ledger.

## Behavior

- Open **Finance → My Entries → Internal Settlement**. Founder accounts default to My Entries, not the agency-wide register.
- The logged-in founder is the sender. Select an **active founder in the same organization** as recipient; enter amount (positive INR with up to two decimal places), date, method and optional note.
- Saving creates **one** InternalSettlement record. It appears in the sender's **My financial register** as **Settlement Out**, and in the recipient's **My financial register** as **Settlement In**, both tagged **Internal Settlement**. Both founders see the same record in a dedicated **Internal settlements received & sent** section, independent of the finance register's 200-item limit.
- The two entries are read-only projections of one record, so they cannot diverge. They are **not** company income or company expense, and are marked **Not included in company totals**. They can be searched and exported in each founder's personal Finance CSV. They are not shown in Agency totals/register, Meta Ads, company financial exports or company reports.
- Only the sending founder can void an entry with a reason. Voiding preserves both personal-history entries as CANCELLED, restores the prior personal expense cycle, and does not change agency accounting.
- No actual transfer is performed or verified by DigiMarket.

## Accounting exclusion

The InternalSettlement model is separate from FinancialTransaction, FinancialCategory, ApprovalRequest, SalaryPayment, SalaryFundingAllocation, RevenueRecognition and Payment. None of these records are created, updated, reversed, or deleted by settlement actions. The agency summary, company charts, company posted net, founder funding accounts, salary balances, assets and profitability remain based on actual financial tables and **never include InternalSettlement**.

**Personal expense-cycle reset:** When an InternalSettlement is recorded, the sender and recipient each begin a new **My Entries** expense cycle. All pre-settlement posted expense, pending expense, attributed salary expense, and Client Meta Ads summary amounts move to historical figures and the **My Entries** expense counters start at **₹0**. Subsequent transactions accrue normally from zero. The reset is based on the server-side settlement creation timestamp, not the editable settlement date. Posted transactions are selected by their posting timestamp (with a creation-time fallback); pending transactions by their creation timestamp. Backdated transactions submitted later belong to the new cycle.

The personal summary exposes `personalSettlementResetAt`, `postedExpenseBeforeSettlement`, and `receivedInternalSettlement` for reconciliation. Settlement amounts are informational; **they are not subtracted from company or personal expenses**. A newer settlement creates the next cycle; voiding a settlement restores the previous active cutoff, and voiding all settlements returns the full historical personal expense total.

**No company changes:** Historical FinancialTransaction records, salary payments, Meta Ads distribution reports, personal register entries and CSV exports remain intact. Agency totals, income, assets, salary funding balances, founder ledger balances and profitability do not reset. This is a personal reporting-period reset, **not proof that all liabilities were actually paid**.

## Permissions and integrity

- Only authenticated users with role FOUNDER and `finance.entry.read.own` can list founders or see settlement history.
- Recording/voiding also requires `finance.entry.create`. Recipients must be active FOUNDER users in the same organization.
- Self-settlement and cross-workspace recipient selection are rejected. Other founders, staff, and outside organizations cannot view the record unless they are its sender or recipient.
- A unique organization-scoped idempotency key prevents duplicate settlement inserts on retries.
- Writes and voids are audit-logged; the sender alone can void a record, and double voids are rejected.
- No new environment variables or third-party integrations are required.

## Deployment

Apply the additive PostgreSQL migration `20261106122500_internal_settlements` via the existing Render backend startup migration procedure. Deploy backend and Vercel frontend from the same merged `main` commit. Do not reset the production database.

The Finance CI integration smoke covers sender/recipient mirroring, agency and staff isolation, CSV, duplicates, **both founders' personal expense-cycle reset, new spending after a reset, a second reset and void restoration**, unchanged agency totals, unchanged transaction history and founder balances.
