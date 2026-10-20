# Module 17: Release engineering and production runbook

**Implementation status:** production readiness code and CI rehearsals are provided. **No live deployment has been performed or verified.** Deploying production still requires provider provisioning, protected environment secrets, an incident owner, and a rehearsal against dedicated staging infrastructure.

## Free-tier deployment profile (October 2026)

The checked-in `render.yaml` provisions **one Render Free web service only**. It contains no paid worker and no unsupported pre-deploy hook. The web service Start Command runs Prisma migration deployment and idempotent permission seeding before it starts the API. Temporary `BOOTSTRAP_*` variables enable a one-time administrator bootstrap on initial startup; remove them after the successful first login (see [Render Free first login](29-RENDER-FREE-FIRST-LOGIN.md)).

The API can handle login and ordinary CRUD without Redis. **Recurring tasks, recurring invoice generation and worker-driven notifications/alerts do not execute** until an independently hosted worker and Redis are provisioned. Do not claim these features are live in the free-tier setup. The full-production roadmap below remains aspirational, not a description of the current free deployment.

## Production architecture

| Component | Hosting and operational role |
| --- | --- |
| Next.js website / server BFF | Vercel project from this GitHub repo, Root Directory `apps/web` |
| Express API | Render Web Service `digimarket-api` using root `render.yaml` |
| BullMQ worker | Not deployed on Render Free; future separately hosted worker requires Redis and a revised deployment configuration |
| PostgreSQL | **New dedicated** Neon PostgreSQL project, pooled `DATABASE_URL` and direct `DIRECT_DATABASE_URL` |
| Redis | Dedicated managed Redis with TLS (`rediss://`) for task/billing/notifications/reconciliation jobs |
| Files | Cloudinary authenticated assets, dedicated production credentials; never publish signed URLs or originals |
| Domain/TLS | Verified Vercel frontend domain; Render API HTTPS hostname; configure origins precisely |
| Backups | Encrypted PostgreSQL snapshots to separate durable storage plus managed Neon PITR; private Cloudinary originals covered by separate recovery policy |

**Do not use an existing Neon database for another business.** Region choice: prefer the same geographic region for Render, Neon and Redis, subject to each provider's available regions. Render's template selects Singapore; this is configuration, not a deployment.

### Pre-release gates
1. Confirm code on `main` and all GitHub Actions, including Module 17, pass on the same exact commit. Protect `main` using required reviews and CI checks. Check `pnpm audit --prod`, Next.js security advisories, threat inventory and dependency updates. Do not blindly auto-fix dependencies on the live branch.
2. Provision a dedicated Neon database. On the **free profile**, Redis and the worker are intentionally absent. For a future full-production profile, provision separate staging/production Neon resources and managed Redis. Record the available backup/restore limits, and use `DIRECT_DATABASE_URL` for migrations.
3. Configure the API-only Render Free Blueprint from `render.yaml`. Deployment is intentionally **manual** (`autoDeployTrigger: off`); attach `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, independent JWT secrets, 32-byte base64 MFA key, Cloudinary credentials and `OPS_MONITOR_TOKEN` in protected Render secret settings. The **Start Command** applies Prisma migrations and idempotently seeds permissions before starting the API. Watch health checks and ensure `/api/v1/ready` returns 200 (database reachable).
4. **Skip the worker on the free tier.** When a future worker+Redis hosting arrangement is available, deploy it separately after migrations, configure TLS `REDIS_URL`, and monitor `/api/v1/ops/health` (header `X-Ops-Token`) for `workerAlive=true`. Until then, an absent worker heartbeat is expected.
5. Connect Vercel to **this** GitHub repo with Root Directory `apps/web`, framework Next.js and the checked-in `apps/web/vercel.json`. Set server-only `API_INTERNAL_URL=https://<api-host>`, `WEB_ALLOWED_ORIGINS=https://<frontend-host>`, `CORS_ALLOWED_ORIGINS=https://<frontend-host>`. Never expose JWT, database credentials, Cloudinary secrets or monitoring tokens as `NEXT_PUBLIC_*`. Vercel and Render must use identical allowed **frontend** origin strings, including scheme and any explicitly specified port.
6. Configure custom frontend domain/TLS, and update both providers' allowed origins before final traffic switch. Confirm refresh-token cookie is Secure/HttpOnly/SameSite=Strict and delivered from the Next.js BFF; token values must never appear in logs or URLs.
7. On Render Free, perform the **one-time** bootstrap by setting temporary `BOOTSTRAP_ORG_NAME`, `BOOTSTRAP_ADMIN_LOGIN` and `BOOTSTRAP_ADMIN_PASSWORD` in the API service environment **before its first successful startup**. The startup guard creates the admin only if the database has no organization, hashes the password and enforces password change and privileged MFA. Remove bootstrap secrets after successful login. Verify login, role restriction, logout and session revocation. No paid shell or worker is required.
8. Run `PROD_API_ORIGIN=https://... PROD_WEB_ORIGIN=https://... node scripts/postdeploy-smoke.mjs` **from a trusted runner**. This checks health, readiness, public home and rejection of anonymous protected API/BFF requests without creating data. Then do staging authenticated journeys: bootstrap/refresh/MFA, clients, project assignments, finance approvals, invoice PDF download and webhook-free Cloudinary authenticated access. Do not automate financial writes against live customer records.
9. Exercise a live production backup and **disposable** restore rehearsal before approving real client data. Document time, operator, restored table counts, checksum, retained encryption key and RPO/RTO measured from the test. CI's disposable PostgreSQL recovery is only a structural rehearsal, not proof of Neon PITR availability.
10. Enable uptime monitoring of `/api/v1/ready`, privileged operations monitoring, worker heartbeat freshness, Redis/BullMQ failures, Neon resource limits, outbox backlog, Cloudinary storage/egress, invoice reconciliation mismatch and error rates. Set incident ownership and a response/escalation channel before onboarding clients.
11. Restrict Render/Vercel release permissions, enable audit trails, rotate initial secrets, configure retention policies and review staging/prod data isolation. Enable automatic deployments **only** after a production review policy prevents untested commits from reaching users.

## Encryption-first database backup

Requires installed PostgreSQL `pg_dump`/`pg_restore` and `age` tools, an off-site storage destination, and environment variables supplied through a private secret manager. No plaintext dumps or keys should enter GitHub artifacts.

- Operator creates an age recipient/keypair using `age-keygen -o /secure/backup.key`, stores the private key offline, and sets `BACKUP_AGE_RECIPIENT` to the public key from `age-keygen -y /secure/backup.key`.
- Backup: `node scripts/db-recovery.mjs backup /secure/exports/agency-20261020.age` with `DIRECT_DATABASE_URL` set in the protected shell. Produces encrypted .age plus SHA-256 sidecar. Upload both to **separate private storage**, with versioning and retention; purge local copies after verified transfer.
- Rehearsal: create an isolated empty database whose name ends `_restore_rehearsal`; set `RESTORE_DATABASE_URL`, `BACKUP_AGE_IDENTITY_FILE`, `DIRECT_DATABASE_URL`, and `RESTORE_REHEARSAL_CONFIRM=YES_RESTORE_DISPOSABLE_DB`. Run `node scripts/db-recovery.mjs restore /secure/exports/agency-20261020.age`. Only that disposable database is modified. Verify counts, relationships, billing sums and login with synthetic rehearsal identities.
- An encrypted dump does not replace Neon provider PITR. Schedule backups daily (or stricter contract-required RPO), perform monthly restore rehearsals, and store a separate backup/recovery plan for Cloudinary authenticated originals and resource metadata.
- **CI** in `.github/workflows/module17-release.yml` makes a disposable encrypted backup, restores it into a distinct PostgreSQL database, and compares permission-catalog row counts without uploading its ephemeral private key or dump.

## Rollback, incident response and monitors

- A routine bad API release: stop the worker, restore the last known-good Render API version, run `/ready` and smoke checks, then restart worker. **Do not automatically reverse migrations** or issue new invoices during rollback; schema changes must remain backward compatible.
- A bad web release: roll back/promote a previously verified Vercel deployment. Recheck cookie, BFF, CSP and allowed frontend origin.
- A DB incident: isolate writes, preserve evidence and compare provider PITR versus encrypted backup restore RPO. First restore into a separate DB and validate, then obtain incident approval for any cutover. Adjust ledger only via auditable compensating entries.
- A compromised secret: revoke sessions/auth version as appropriate, rotate JWT/MFA encryption safely (encrypted MFA material needs re-encryption migration), Redis/Neon/Cloudinary keys and ops monitor token. Treat raw MFA-key rotation without migration as a potentially destructive change.
- Alerts: readiness != full service availability. `/ready` checks DB only; `/ops/health` checks worker heartbeat and summarizes pending/stalled outbox events. Outbox events are **not** automatically delivered by this module, so pending counts indicate backlog, not guaranteed delivery failure. Review them before enabling integrations.

## Explicit limits, not hidden launch claims
- Repo code, permissions, migrations and integration tests are not a substitute for deploying and hardening actual Neon/Redis/Render/Vercel/Cloudinary accounts.
- Live provider connections, production domain, incident contact, paid hosting, backups and a real Neon restore rehearsal are not created from this repository alone.
- Generated invoice PDFs are authenticated on demand, not currently archived to durable private Cloudinary objects. If archival retention is contractually necessary, block invoicing onboarding until that work and a restore exercise are complete.
- Existing module-level tests protect against duplicate cash posting and cross-organization leaks, but a specialist penetration test and manual browser acceptance on the deployed domain remain recommended.
