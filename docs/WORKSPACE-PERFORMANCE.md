# Workspace performance rollout

- Login and refresh now include identity, avoiding a separate /me request; older deployments still work through a fallback.
- Every API authentication reads the current session and narrow user/role fields from PostgreSQL. Revocation and access checks are never cached.
- One TanStack Query client lives at the auth provider. GETs share in-flight requests; only explicit opt-in client-directory reads are fresh for 20 seconds. Refresh bypasses freshness. Cache is memory-only, scoped by user, workspace and grants, and discarded on writes or identity changes.
- Upstash is optional and initially only caches the non-financial client delivery report for 10 seconds. Reads are permission-checked; keys include actor, grants and agency date. The report is a bounded snapshot, not an authoritative financial ledger. Set fresh=1 to bypass Redis. No Redis tokens, identity, credentials, finance, or salary data are cached. Cache failures fall back to PostgreSQL.
- On Render, configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN as server secrets. Choose an Upstash region close to the API, not the browser. Use a dedicated cache database. No worker queue changes.
- Two additive indexes cover login ID lookups and client agreement status filters; use EXPLAIN ANALYZE and production latency measurements to validate benefit before expanding index coverage.
- Validate login, logout, expired/revoked sessions, role changes, client writes, report snapshots, cache failure, and frozen-lockfile CI. Measure request counts and p50/p95 before/after. Render cold starts remain a separate concern.
