# Workspace performance rollout

- Login and refresh now include identity, avoiding a separate /me request; older deployments still work through a fallback.
- Every API authentication reads the current session and narrow user/role fields from PostgreSQL. Revocation and access checks are never cached.
- One TanStack Query client lives at the auth provider. GETs share in-flight requests; only explicit opt-in client-directory reads are fresh for 20 seconds. Refresh bypasses freshness. Cache is memory-only, scoped by user, workspace and grants, and discarded on writes or identity changes.
- Upstash is optional and initially only caches the non-financial client delivery report for 10 seconds. Reads are permission-checked; keys include actor, grants and agency date. The report is a bounded snapshot, not an authoritative financial ledger. Set fresh=1 to bypass Redis. No Redis tokens, identity, credentials, finance, or salary data are cached. Cache failures fall back to PostgreSQL.
- On Render, configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN as server secrets. Choose an Upstash region close to the API, not the browser. Use a dedicated cache database. No worker queue changes.
- Two additive indexes cover login ID lookups and client agreement status filters; use EXPLAIN ANALYZE and production latency measurements to validate benefit before expanding index coverage.
- Validate login, logout, expired/revoked sessions, role changes, client writes, report snapshots, cache failure, and frozen-lockfile CI. Measure request counts and p50/p95 before/after. Render cold starts remain a separate concern.

## Phase 1 reliability extension

- Readiness summary queries use bounded batches of 100 client IDs and identical single-client calculations; all saved movements, dates and quantities remain intact. No new migration or data rewrite.
- Short-lived browser cache covers selected read-only lists, today cards and non-financial reports. Edits, exports, financial totals and document drafts continue to use live reads. Explicit refresh bypasses retained data. Cross-tab invalidation and logout use BroadcastChannel; supported browsers serialize refresh-cookie rotation with Web Locks, without storing or sharing tokens.
- The report cache uses an organization version key rotated after relevant committed client writes and lead conversion. TTL remains ten seconds for other writers or failures; direct report refresh bypasses Redis. Cache failure never blocks a committed database write. Upstash credentials remain API-only.
- Private GET /api/v1/ops/performance accepts the existing x-ops-token header. It provides process-local latency histograms (upper-bound p50/p95), errors and Redis counters without request paths containing identifiers, query strings, bodies, or secrets. Logs include only fixed route templates for slow requests. The frontend API gateway supplies Server-Timing for upstream response latency. No external telemetry account required.
- PDF preview and export code loads on demand; the main CI workflow caches pnpm dependencies while retaining its full checks. No changes to financial mutation code, permissions, or stored record schemas. Hosting plan/region and production verification remain operational decisions.
