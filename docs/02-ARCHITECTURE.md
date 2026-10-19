# Technical architecture
## Architecture decision
Modular monolith API with separate Next.js web application. Deploy web and API separately, sharing type/validation contracts through a pnpm workspace. One Neon PostgreSQL system of record. Redis is ephemeral infrastructure for caching, rate limiters, queues and fan-out, not durable financial storage.

## Logical diagram
~~~mermaid
flowchart LR
  U[Admin / Founder / Employee] --> W[Next.js TypeScript Web]
  W -->|HTTPS cookie/JWT| A[Express TypeScript API]
  A -->|Prisma| P[(Neon PostgreSQL)]
  A --> R[(Redis)]
  A --> C[Cloudinary]
  R --> Q[BullMQ Worker]
  Q --> P
  Q --> C
  A -. SSE authenticated events .-> W
~~~

## Monorepo structure (to be created by Module 1)
~~~text
apps/
  web/                   # Next.js App Router, route groups, components
  api/                   # Express HTTP layer, domains and middleware
  worker/                # BullMQ processing, may share API image initially
packages/
  db/                    # Prisma schema and migrations
  contracts/             # Zod DTOs and shared TypeScript types
  ui/                    # Shared UI as needed
docs/                    # This spec and implementation decisions
~~~

## Service/domain boundaries
| Domain | Owns | Consumes |
| --- | --- | --- |
| Identity | users, sessions, permissions | organization |
| CRM | leads, followups, conversions | identity, clients |
| Clients | client record, contacts, services | identity, assets |
| Finance | ledger, approvals, categories | identity, clients, project |
| Workflow | approval requests/steps | identity, domain callbacks |
| Projects | projects, milestones, deliverables | clients, tasks, assets |
| Tasks | task instances, recurrences | users, projects, jobs |
| Content | content items, review history | clients, assets, workflows |
| Assets | metadata, Cloudinary operations | client/project permissions |
| Billing | invoices, payments, allocations | clients, finance |
| Reporting | read queries, aggregates | all domains, scoped visibility |

## Request flow
1. Browser calls /api/v1 endpoint over HTTPS with HttpOnly session/refresh cookie or access token in approved transport; browser token storage must avoid localStorage.
2. Middleware authenticates, establishes organization and requester identity.
3. Route validates DTO with shared Zod contract.
4. Authorization middleware checks permission and domain-layer record scope.
5. Domain service runs PostgreSQL transaction for authoritative mutation; writes AuditLog and outbox event within the same transaction for critical events.
6. After commit, outbox dispatcher invalidates Redis cache, publishes a scoped SSE event and enqueues background work. Workers recheck permissions/context when acting.
7. Browser updates view or refetches authoritative read model. Missing SSE events are repaired by refetch on reconnect.

## Real-time data
- Use authenticated SSE for status/summary invalidations, not sensitive full record broadcasts.
- Event channel is scoped to organization and permission audience (and optionally user).
- Redis Pub/Sub is non-durable. Persist audit/outbox events in Postgres when loss would matter.
- Consumers use event IDs or version numbers and refetch if there is a gap.
- Cache keys include organization, role/scope and filter set to avoid cross-user leaks.
- Finance cache invalidation only occurs after DB commit.

## Authentication
- Unique login ID provisioned by admin; no public registration.
- Argon2id hash for password, tunable parameters, no recoverable original.
- Short-lived JWT access tokens with minimal claims (sub, sid, org, issued/expiry, version); verify algorithm/audience/issuer.
- Rotating refresh token sessions stored hashed in database; revoke all on credential change/disable.
- Same-site secure HttpOnly cookies preferred for browser; implement CSRF defenses for cookie-authenticated writes.
- MFA required for privileged roles; unauthorized requests default to deny.

## Asset handling with Cloudinary
- Express validates requested upload scope/type/size then issues signed, scoped upload parameters (or proxies file where necessary).
- On completed upload, backend verifies Cloudinary identity and metadata before associating asset with database record.
- Public marketing assets may be explicitly public. Receipts, invoices, contracts and private client content require restrictive delivery configuration.
- Authorized download endpoint generates short-lived delivery URL or returns a protected response, never stores unconstrained signed URL in public data.
- Deletions archive metadata first, enqueue cleanup, and retain audit event; prevent deleting assets referenced by an issued invoice without proper retention policy.

## Background jobs
- BullMQ for recurring task occurrence generation, reminders, invoice draft generation, Cloudinary cleanup, reconciliation and outbox delivery.
- Unique logical keys per business event; deduplication guaranteed by PostgreSQL unique constraints, not queues alone.
- Explicit timezone for recurring schedules (default Asia/Kolkata), calendar-aware DST behavior if other regions later.
- Retries with exponential backoff, dead-letter alerting and manual replay process.

## Failure and consistency
- Financial writes and payment allocations use DB transactions, locking/unique constraints and idempotency keys.
- Do not calculate balances from stale Redis as sole source; rebuild aggregates from canonical transactions.
- Cloudinary uploads can be orphaned after a failed DB write: a reconciler cleans these up.
- Clock/event ordering relies on stored timestamps + monotonically increasing row version where needed.
- DB unavailable => reject writes instead of pretending success; Redis unavailable => degrade caches and job processing safely.

## Deployment topology
- Vercel web on dedicated app domain.
- Render API plus worker process, each with access to Neon, managed Redis and Cloudinary.
- Neon pooled runtime URL, direct migration URL.
- Separate dev/staging/prod Cloudinary folders or environments and database resources.
- Environment secrets only in platform secret stores.
- CI checks: lint → types → unit → integration → build → migration review.
- Monitoring on API errors, job failures, DB saturation and storage access anomalies.

## Architecture decisions locked for v1
ADR-001 Modular monolith rather than microservices.
ADR-002 PostgreSQL is authoritative; Redis cache/queue only.
ADR-003 Common organization_id on business records.
ADR-004 Signed/scoped Cloudinary uploads and private delivery for sensitive assets.
ADR-005 Server-enforced RBAC + record checks.
ADR-006 Post-commit outbox for critical asynchronous side effects.
ADR-007 Content publishing status is manual in v1; no direct platform publishing.
ADR-008 No hosted checkout/payment processing in v1.
