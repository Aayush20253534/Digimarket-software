# Domain workflows and state machines
All state transitions below describe intended application logic. Every authorized mutation writes audit history. Critical asynchronous effects use an outbox entry committed in the same DB transaction.

## 1. Expense and income
~~~mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SUBMITTED
  SUBMITTED --> CHANGES_REQUESTED
  CHANGES_REQUESTED --> SUBMITTED
  SUBMITTED --> APPROVED
  SUBMITTED --> REJECTED
  APPROVED --> POSTED
  POSTED --> REVERSED
  REJECTED --> [*]
~~~
- Creator chooses INCOME or EXPENSE and fills category, positive decimal amount, date and supporting file.
- On submit, approval engine snapshots applicable policy and locks material fields during review.
- Approval commits decision; posting includes amount in authoritative totals exactly once.
- If an approved entry represents a future/uncleared event, do not show it as verified cash until cash posting rules are satisfied.
- Posted records are immutable for business-critical fields. Corrections create linked reversing/replacement transactions.
- Employee's "My Finance" shows own entries with all statuses; company reports filter by finance.read.all and can separately show pending amounts.

## 2. Lead to client
~~~mermaid
flowchart LR
  N[New lead] --> C[Contacted]
  C --> Q[Qualified]
  Q --> P[Proposal]
  P --> W[Won]
  P --> L[Lost]
  W --> T[Single client record]
~~~
- Phone normalized for duplicate signals, but duplicate matches require human resolution.
- Lead notes are append-only activity records with actor, time and event type.
- Convert uses transaction with a unique former_lead_id. Repeat requests return existing linked client, not another new client.
- Once converted, Lead stays for provenance and Client becomes operating record.

## 3. Project delivery
- Client added → project PLANNED → assign owner/members → ACTIVE.
- Project has milestones, tasks and deliverables; team sees permitted assets.
- Deliverable submitted → approval pending → accepted or changes requested.
- Rejected deliverable remains recoverable with comments and versioned resubmission.
- Project COMPLETE only when required milestones/deliverables satisfy configured rule (or authorized override with reason).
- Project costs link to transactions, not copied cost fields.

## 4. Content production
~~~mermaid
stateDiagram-v2
  [*] --> IDEA
  IDEA --> DRAFT
  DRAFT --> IN_REVIEW
  IN_REVIEW --> CHANGES_REQUESTED
  CHANGES_REQUESTED --> DRAFT
  IN_REVIEW --> APPROVED
  APPROVED --> SCHEDULED
  SCHEDULED --> PUBLISHED
  APPROVED --> PUBLISHED
  IDEA --> CANCELLED
  DRAFT --> CANCELLED
  SCHEDULED --> CANCELLED
~~~
- Calendar date is planned_at, not proof that post went live.
- Revision is associated with approval request; editing approved material invalidates approval for material changes.
- Manual published status requires actor, timestamp and optional platform URL.
- No auto-posting to social networks in v1.

## 5. Task assignment and recurrence
- Admin/authorized manager assigns task to user(s); employee views personal queue.
- DONE writes completion metadata, but does not alter a project's delivery approval automatically.
- Recurring schedule is stored with timezone and recurrence definition. A worker claims occurrences and attempts INSERT with unique (recurrence_id, occurrence_key).
- Occurrence key normalized to the intended scheduled datetime, not actual worker execution time.
- Failed jobs retry; uniqueness prevents double creation. Disabled recurrence prevents future occurrences without deleting historical tasks.
- Recurrence preview is shown before activation; missed-run/backfill rules configurable with safe default to avoid surprise task floods.

## 6. Invoice/payment reconciliation
~~~mermaid
flowchart TD
  D[Invoice draft] --> I[Issued and numbered]
  I --> O[Outstanding receivable]
  O --> P[Payment recorded pending verification]
  P --> V[Payment verified]
  V --> A[Allocated to invoice]
  A --> B{Outstanding balance?}
  B -->|Positive| O
  B -->|Zero| F[Paid]
~~~
- Draft editable; issue freezes line items, computes subtotal/tax/discount/total in a transaction and reserves per-org invoice number.
- Issued invoice increases receivable (based on chosen recognition policy), not cash balance.
- Payment can be recorded and verified independently of allocation; verify creates exactly one linked posted cash receipt.
- Allocation checks currency, client, positive amount, paid balance and prevents over-allocation with row locking.
- Invoice paid/partial/unpaid derived from verified allocations and credits; overdue derived from due date, not a manually set flag.
- Void/credit adjustments must preserve the original issued invoice audit trail.
- Recurring schedules generate invoice DRAFT records, never auto-issue without explicitly configured policy.

## 7. Client profitability
- Costs link to client/project through transaction FK. Project cost rolls up to client.
- Recognized revenue per policy is distinct from payments collected.
- Contribution = recognized client revenue - attributable direct costs.
- Show collections and receivables separately; allocated overhead only when configured, labeled with method.
- No comparison of amounts across currencies without FX normalization and documented exchange rate.
- Profit report recalculates on posted finance / issued invoice / payment updates, never treats planned project budget as actual expense.

## 8. File lifecycle
- User requests upload intent scoped to company/client/project.
- API verifies permission and enforces allowed MIME, resource type and size policy; creates temporary intent ID.
- Browser uploads to Cloudinary with short-lived signature.
- API confirms provider file, creates Asset record and attaches it to allowed target.
- Viewer requests download; API rechecks access and emits short-lived signed delivery method for sensitive data.
- Archive revokes app references; external cleanup only after retention/linked-document checks.
- On failed confirmation, reconciliation worker cleans orphaned Cloudinary asset.

## 9. Cross-module events
| Event | Source | Listeners |
| --- | --- | --- |
| LeadConverted | CRM | Clients, notifications |
| TransactionPosted | Finance | Reports, cache invalidation |
| ApprovalResolved | Workflows | Finance, content, deliverables, notifications |
| TaskDueSoon | Tasks/jobs | Notifications |
| ContentApproved | Content | Calendar, notifications |
| PaymentVerified | Billing | Finance cash receipt, reports |
| PaymentAllocated | Billing | Invoice outstanding balance, reports |
| InvoiceIssued | Billing | Receivables, reminders |
| AssetArchived | Assets | Content/project link check, cleanup |

## State machine guardrails
1. Terminal/irreversible state changes require a reason where material.
2. Permission is checked before and during transactional mutation where needed.
3. Stale versions and duplicate submissions return stable conflict behavior.
4. Consumers cannot alter another domain's authoritative data without a domain service/command.
5. Audit history is immutable and sensitive values are redacted.
