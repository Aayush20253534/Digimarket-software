# Internal Settlement, Finance My Entries

Internal Settlement records an **informational founder-to-founder movement**, without modifying DigiMarket's accounting ledger.

## Behavior

- Open **Finance → My Entries → Internal Settlement**.
- The logged-in founder is the sender. Select an **active founder in the same organization** as recipient; enter amount (positive INR with up to two decimal places), date, method and optional note.
- Saving creates **one** InternalSettlement record. It appears in the sender's **My financial register** as **Settlement Out**, and in the recipient's **My financial register** as **Settlement In**, both tagged **Internal Settlement**.
- The two entries are read-only projections of one record, so they cannot diverge. They are **not** company income or company expense, and are clearly marked **Not included in totals**. They can be searched and exported in each founder's personal Finance CSV. They are not shown in Agency totals/register, Meta Ads, company financial exports or company reports.
- Only the sending founder can void an entry with a reason. Voiding preserves both personal-history entries as CANCELLED and does not change accounting.
- No actual transfer is performed or verified by DigiMarket.

## Accounting exclusion

The InternalSettlement model has no relation to FinancialTransaction, FinancialCategory, ApprovalRequest, SalaryPayment, SalaryFundingAllocation, RevenueRecognition or Payment. None of these rows are created, updated, reversed, or deleted by settlement actions. Financial summary, founder net posted, income/expense charts, Meta Ads, salary funding balances, total assets and profitability query existing financial tables only and **do not query InternalSettlement**.

The "INCOMING" and "OUTGOING" directions are **display-only**. Settlement entries never count toward financial income, expense or company Net posted. My Entries includes them for personal visibility, not accounting.

## Permissions and integrity

- Only authenticated users with role FOUNDER and `finance.entry.read.own` can list founders or see settlement history.
- Recording/voiding also requires `finance.entry.create`. Recipients must be active FOUNDER users in the same organization.
- Self-settlement and cross-workspace recipient selection are rejected. Other founders, staff, and outside organizations cannot view the record unless they are its sender or recipient.
- A unique organization-scoped idempotency key prevents duplicate settlement inserts on retries.
- Writes and voids are audit-logged; the sender alone can void a record, and double voids are rejected.
- No new environment variables or third-party integrations are required.

## Deployment

Apply the additive PostgreSQL migration `20261106122500_internal_settlements` via the existing Render backend startup migration procedure. Deploy backend and Vercel frontend from the same merged `main` commit. Do not reset the production database.

The Finance CI integration smoke covers sender/recipient mirroring, agency and staff isolation, CSV, duplicate submissions, voiding and **unchanged financial transactions, summaries and founder balances**.
