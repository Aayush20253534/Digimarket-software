# Wireframe 02 — Finance, categories, requests

## A. Finance overview (authorized user)
~~~text
Finance                                      [+ Expense] [+ Income]
[Month ▼] [User ▼] [Category ▼] [Client ▼]        [Export ▼]
[Posted inflows] [Posted outflows] [Net movement] [Pending approvals]
┌────────────────────────────────────────────────────────────────┐
│     Period breakdown chart (verified amounts only)            │
└────────────────────────────────────────────────────────────────┘
Tabs: [Transactions] [Expenses] [Income] [Categories] [Reports]
Date       Type      Category  Merchant/source  User   Status  Amount
2026-10-19 Expense   Transport Rapido           ...    Pending 185.00 INR
...
~~~
The company overview requires finance.read.all. Employee personal finance shows submitted-by-me view and status rather than organization-wide amounts.

## B. Add expense/income
~~~text
New expense                                  [Save draft] [Submit]
Amount * [185.00]  Currency [INR]
Category * [Transport ▼]
Merchant   [Rapido]
Date *     [2026-10-19]
Payment method [UPI ▼]
Client [optional ▼] Project [optional ▼]
Description [____________________________]
Receipt / supporting files [choose/upload] (after Module 9)
[Cancel] [Save draft] [Submit for approval]
~~~
- Client/project selection permission-filtered; project must belong to selected client.
- Merchant is not category. Admin configures categories; staff selects them.
- Data validation checks decimal precision, positive amount, date, category type, missing required fields.

## C. Approval queue
~~~text
Approvals                 [Pending ▼] [Type ▼] [Requester ▼]
Type       Requester     Submitted     Amount       Action
Expense    Employee A    19 Oct        185.00 INR   [Review]
Content    Employee B    19 Oct        —            [Review]

[Approval review drawer]
Request context and policy: Travel expense / 185.00 INR
Submitted by: ...
Category: Transport
Receipt: [permission-protected preview]
Policy step: Finance manager
Comment [____________________________________]
[Approve] [Return for changes] [Reject]
~~~
Stale decisions return conflict and refresh state; no double confirmation.

## D. Category administration
~~~text
Financial categories                     [+ New category]
[Income | Expense] [Search] [Active only]
Category name              Kind          Status      Actions
Transport                  Expense       Active      Edit / Archive
Subscriptions              Expense       Active      Edit / Archive
Client services            Income        Active      Edit / Archive
~~~
Archiving a category prevents new use, never rewrites historical entries.

## E. Finance reports
~~~text
Finance report
[Period] [Submitted by] [Category] [Client/Project] [Status]
[Apply filters] [Export CSV]
Metric definitions (posted only / cash basis / pending separated)
[Income trend] [Expense distribution]
[Detailed row-level report, with audit/adjustment links]
~~~
Keep invoice receivables and verified receipts separate from other income to avoid duplicate totals.
