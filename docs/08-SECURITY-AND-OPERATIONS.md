# Security, privacy and operating model
**Security baseline for design and future implementation.** Do not confuse this file with a completed security review.

## Threat model
Assets to protect: employee authentication, third-party client accounts, customer contacts, unpublished media, bank/payment information, contracts/invoices, authorization policy and audit records.
Attackers: external unauthenticated attackers, phished users, misconfigured staff permissions, malicious insider, leaked Cloudinary asset links and compromised deployment credentials.

## Identity and sessions
- No public registration. Unique login IDs assigned by admin; one-time bootstrap owner mechanism.
- Hash passwords with Argon2id. Do not send/recover original passwords after provisioning.
- Temporary password expires and must be changed at first use.
- MFA for founders with finance/secret powers and all privileged administrator accounts.
- Access JWT short lived, validated issuer/audience/algorithm and scoped to session.
- Refresh tokens rotated, hashed server-side, revocable; detect refresh reuse and revoke session family.
- Prefer HttpOnly Secure SameSite cookies for browser auth; evaluate CSRF protection on state-changing requests.
- Throttle login and password reset; generic auth failures; device/session management and audit.
- Session revocation/disabled user enforced on server, not by hiding UI.

## Authorization and privacy
- All records scoped by organization_id; check record ownership, assignment and permitted actions.
- Never use role names in UI as sole authorization.
- Minimize exposed PII. Audit access to credentials, invoice exports and mass downloads.
- Client access delegation preferred for Meta/social platforms rather than storing username/password.
- If a credential vault becomes essential, choose separate encrypted managed secret service, avoid database plaintext and prevent secrets in logs/analytics.
- Search index, Redis and SSE must not broaden access scope.

## Cloudinary security
- Secret keys only on server/environment secret store.
- Restrict upload signatures to validated transformations, sizes, formats and configured asset folder/prefix.
- Confirm provider upload metadata before recording ownership.
- Client unpublished videos, receipts, invoices and contracts must not use public/unrestricted delivery.
- Signed URL expiry and authorization on every access; do not cache signed URLs across users.
- Apply upload abuse limits and malicious file type checks; server-side MIME not solely based on user-provided extension.
- Monitor storage, bandwidth, transformations and deletion failures.
- Implement retention policies, legal holds where relevant and orphan cleanup.

## Finance integrity
- Numeric Decimal amounts, explicit currency, unique linked Payment → FinancialTransaction, transactional PaymentAllocation.
- Do not expose net/profit aggregations to users without report permission.
- No direct edit/delete of posted finance records or issued invoice lines; corrections through auditable workflow.
- Stronger approval/verification for finance than ordinary task completion.
- Centralized time-interval and status definitions; reports include applied filters and methodology.
- Periodic reconciliation between invoice allocations, payment receipts and finance ledger.

## API hardening
- CORS restricted to known frontend origin; no wildcard credentials.
- Helmet/security headers and output escaping; CSP designed for Cloudinary preview.
- Input limits, Zod schemas, file type/size limits, rate limiting, permission checks on all routes.
- Parameterized ORM queries; avoid unsafe raw SQL.
- No secrets, full HTTP Authorization, token cookies or bank information in logs.
- Use generic 404 response for non-visible IDs to reduce enumeration.
- Strict least-privilege DB and Cloudinary account credentials.

## Infrastructure
- Separate development, staging and production data and secrets.
- Vercel frontend; Render API/worker; Neon PostgreSQL; Redis; Cloudinary.
- Managed TLS/HTTPS. Correct reverse proxy trust configuration.
- Neon migration deploy via CI release process using direct connection.
- Daily/managed DB backups with recorded retention; monthly restore exercise before public agency use.
- Cloudinary originals and metadata backup/recovery strategy; provider retention is not a substitute for an agency restore plan.
- Rotate credentials on suspected leak; log each administrative change.
- Production launch requires a domain, authenticated setup flow, environment configuration and an incident contact.

## Observability
- Structured API logs with request ID, actor/user ID where allowed, org ID, action and result (excluding sensitive payload).
- Metrics: latency, 4xx/5xx rates, DB connection exhaustion, redis failures, BullMQ failed/retry/delayed jobs, SSE reconnect rate, Cloudinary uploads/egress.
- Alerts: repeated login failures, role changes, mass export, upload abuse, finance reconciliation mismatch, outbox backlog, failed invoice generation.
- Immutable audit logs for approval/finance changes; retention policies decided prior to production.

## Privacy and lifecycle
- Keep only data needed for agency operations.
- Access/rectification and deletion handling must respect contract, invoice and legal retention obligations.
- Employee deactivation removes future access but preserves historical attribution.
- Prefer archive over destructive delete for clients, invoices, finance and approved content.
- Do not import third-party personal data without lawful/contractual basis.

## Environment variable contract (names only)
~~~text
DATABASE_URL
DIRECT_DATABASE_URL
REDIS_URL
JWT_ISSUER
JWT_AUDIENCE
JWT_ACCESS_SECRET_OR_PRIVATE_KEY
JWT_REFRESH_SECRET
SESSION_COOKIE_DOMAIN
CORS_ALLOWED_ORIGINS
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_PRIVATE_FOLDER_PREFIX
APP_BASE_URL
API_BASE_URL
LOG_LEVEL
~~~
JWT algorithm/key choice will be finalized during Module 3. This list is not a credential file.

## Production gates
- [ ] Threat model and sensitive field inventory reviewed.
- [ ] Privileged MFA, auth flow and revocation tested.
- [ ] Cloudinary restricted media verified inaccessible without permission.
- [ ] Backup restore performed and documented.
- [ ] Cross-organization and cross-role integration tests pass.
- [ ] Payment posting and invoice allocation concurrency tests pass.
- [ ] Production secrets configured outside Git.
- [ ] Monitoring/alerts and incident owner identified.

## Incident checklist
1. Contain: revoke compromised tokens/secrets or disable account.
2. Determine impacted organization, entities, duration and unauthorized actions from audit.
3. Preserve evidence; review Cloudinary deliveries and data exports.
4. Restore/reconcile impacted records transactionally with documented adjustments.
5. Apply legal/contractual notification requirements as appropriate.
6. Root-cause, patch, rotate credentials and rerun regression tests.
