# DigiMarket UI v2 — Phase 4: Operations

## Scope
Phase 4 unifies Client Deliveries, Tasks, Task History and Approvals with monochrome dark/light UI surfaces and role-aware Operations navigation.
All previous URLs, original records, APIs, role grants, recurrence rules and action/confirmation behaviour remain intact. No database migration or financial calculations changed.

## Operations navigation
Client Deliveries (/app/deliveries) requires clients.read. Tasks (/app/tasks and /app/task-history) requires tasks.read. Approvals (/app/approvals) requires approvals.read. Navigation visibility does not replace backend permission checks.

## Deliveries
- The shared ClientDeliveryWorkspace is used by /app/deliveries and each client Delivery tab.
- Five page-scoped summary figures: loaded schedules, overdue dates, due today, upcoming dates and completed dates.
- Local service/client/assignee search and All / Overdue / Today / Upcoming / Completed filters do not change data or API pagination.
- Per-schedule accessible completion bars supplement existing week navigation and date checkboxes.
- Recurrence, permissions, editing, reassignment, pending/future restrictions and delete confirmation are unchanged.

## Tasks and History
- Tasks retain their existing server search/status/scope, admin page limits, creation, editing, recurrence, comments, state transitions and deletion.
- The currently loaded Tasks page gains five counters and a grayscale status distribution including other states. Priority filter applies to loaded records only.
- Task History continues using its original cursor pagination, authenticated team scope and task deep links.
- History counters distinguish page total, last-24-hour completions, on-time and late completions with known timestamps. Priority filtering remains local.

## Approvals
- The current approval view gains page-scoped pending/approved/rejected/cancelled metrics, search and category filtering.
- Existing My Requests / Decision Queue / Decision History navigation remains and synchronizes the URL.
- Links to decision queue/history are downgraded to My Requests if approvals.decide is absent.
- Approval/cancellation confirmation, mandatory rejection reason, policy editing, and downstream finance posting are unchanged.

## Responsive styling and QA
- aw-phase4-operations.css overrides legacy purple operation views using inherited --ui-* tokens and semantic --stage-* status variables.
- Cards, registers, checklists, filters and tabs adapt to mobile and respect reduced-motion and accessible keyboard navigation.
- Browser checks added for Operations navigation, page counts, safe delivery filters, progress bar, Task History filtering and approval view controls.
- Gate release on route compatibility, lint, TypeScript, unit/API tests, builds, smoke and authenticated browser checks. Check Vercel main deployment after merge.

## Next phase
Phase 5: Finance, Documents and Reports UI.
