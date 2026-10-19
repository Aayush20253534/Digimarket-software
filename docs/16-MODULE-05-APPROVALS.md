# Module 5 — Approval Workflow Engine

## Scope
Reusable, organization-scoped approval engine for later finance, content, project and deliverable modules. Approval decisions do not modify any domain ledger, content publication status or deliverable state until those modules implement explicit transaction-safe integration.

## Implemented
- PostgreSQL models for configurable per-category policies, requests and immutable one-time decisions, with versioned Prisma migration.
- Categories: GENERAL, FINANCE, CONTENT, DELIVERABLE.
- Policy role configuration with immutable snapshot of approver roles when a request is submitted.
- PENDING → APPROVED / REJECTED / CANCELLED; only the requester may cancel; rejection requires a reason.
- No self-approval. A request must be approved by a distinct, authenticated user with both approvals.decide permission and a captured eligible role.
- Tenant-filtered reads and writes; requester sees own entries; approvers see authorized pending queue and decision history.
- Optimistic compare-and-swap PostgreSQL updateMany plus a unique decision/request constraint; concurrent decisions cannot both succeed.
- Audit entries and minimal outbox messages created in the same transaction as submission/decisions.
- API body validation with shared Zod schemas and documented response codes.
- Responsive Next.js /app/approvals UI for submission, own history, decision queue and privileged policy editing.
- Same-origin Next API proxy allowlist; no wildcard proxy endpoint.
- Isolated PostgreSQL CI suite covering authorization, tenant scoping, CAS, audit/outbox, cancellation and policy snapshots.

## Endpoints
- GET /api/v1/approval-policies
- PUT /api/v1/approval-policies/:category (approvals.policy.manage)
- GET /api/v1/approvals?view=mine|queue
- POST /api/v1/approvals
- GET /api/v1/approvals/:id
- POST /api/v1/approvals/:id/decision
- POST /api/v1/approvals/:id/cancel

## Role defaults
- SUPER_ADMIN: read, submit, decide, policy management
- ADMIN: read, submit, decide, policy management
- FOUNDER: read, submit, decide
- EMPLOYEE: read own/submit/cancel own

Existing system roles can receive additive Module 5 permissions by rerunning the idempotent permission seeder; custom roles remain unchanged. Permissions remain enforced on each API request, never assumed from the UI.

## Cloud verification
The GitHub workflow `.github/workflows/module5-approvals.yml` migrates an isolated PostgreSQL 16 database, verifies Prisma schema drift, lint, typecheck, tests and build, then invokes `apps/api/src/approvals/integration-smoke.ts`. It does not connect to a live Neon database or create production accounts.

## Operational caveats
- Policies initially have no seeded records; an administrator must configure an active GENERAL policy before a first submission.
- The approval outcome is advisory to future modules until their domain-specific state transitions and validations are implemented.
- No emails, chat notifications, Redis worker processing or SLA escalation are connected yet.
- No invoice, finance or client assets exist in this module.
- Production deployment, database initialization, backups, and monitoring are Module 17 concerns.

## Module 6 integration update
Module 6 links a FINANCE approval request with each income/expense submission. Approving, rejecting, or cancelling such a request changes the financial transaction in the **same database transaction** as the decision, with additional `finance.approve` enforcement for reviewers. Generic approval requests remain independent. See [finance implementation](17-MODULE-06-FINANCE.md).
