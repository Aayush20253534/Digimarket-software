# Module 3: Authentication, MFA and permissions

## Implementation scope
- Internal-only auth, no public registration.
- One-time CLI bootstrap of an organization and initial SUPER_ADMIN.
- Argon2id password hashing, mandatory first-login password rotation.
- Short-lived JWT access and challenge tokens. Live database checks on every protected request.
- Hashed, revocable and rotated refresh tokens in HttpOnly cookies.
- Origin checks on refresh/logout; HTTPS cookie flag in production.
- TOTP MFA for SUPER_ADMIN, ADMIN and FOUNDER; AES-256-GCM encrypted secrets.
- Admin staff creation, reset and disable; only super admin can promote to leadership roles.
- Permission-enforced user APIs with auditable identity mutations.
- GitHub-hosted isolated PostgreSQL database integration tests.

## Routes
- POST /api/v1/auth/login
- POST /api/v1/auth/change-password
- POST /api/v1/auth/mfa/setup
- POST /api/v1/auth/mfa/confirm
- POST /api/v1/auth/mfa/verify
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET /api/v1/me
- GET/POST /api/v1/users
- POST /api/v1/users/:id/reset-password
- POST /api/v1/users/:id/disable
- PUT /api/v1/users/:id/role

## Production configuration
With DATABASE_URL enabled, the API requires JWT_ACCESS_SECRET, JWT_CHALLENGE_SECRET (distinct, 32+ bytes) and MFA_ENCRYPTION_KEY_BASE64 (32-byte random key encoded base64). Missing configuration fails startup, never silently opens protected routes. Configure CORS_ALLOWED_ORIGINS to the actual frontend origin.

Bootstrap via cloud-only job using BOOTSTRAP_ORG_NAME, BOOTSTRAP_ADMIN_LOGIN and BOOTSTRAP_ADMIN_PASSWORD in secret manager, then execute `pnpm --filter @digimarket/api exec tsx src/auth/bootstrap.ts`. The bootstrapping command refuses a database with an existing organization; no account is created in an unrelated existing Neon project.

## Security and rollout caveats
- Modules 0–2 were already implemented; Module 3 does not connect the real company database until a dedicated Neon database is approved/configured.
- Initial login UI and management screens are Module 4.
- Redis-distributed throttling, MFA recovery flow and authenticated self-service password changes will require explicit work before live launch.
- Token and client data never belong in browser localStorage; frontend should keep access tokens in memory and receive refresh tokens in HttpOnly cookies.
- Default role matrix grants are explicitly assigned during bootstrap. Founder labels do not themselves grant access.
- Every new future domain route must enforce authenticated principal, organization filters and record-level access; a sidebar is not a security control.
- Test flows and all actual validation evidence should be recorded after GitHub Actions finishes.

## Verified remote acceptance
- [x] Argon2id, JWT purpose isolation, encrypted TOTP and unit tests pass.
- [x] First-admin bootstrap rejects repeat initialization.
- [x] Initial password-change challenge enforced and verified.
- [x] SUPER_ADMIN TOTP enrollment required before signed-in session.
- [x] Employee provisioning, reset, disable and role change tested.
- [x] Restricted role cannot list/provision staff.
- [x] Refresh token rotation and replay revocation tested; cross-origin refresh rejected.
- [x] Prisma migration and dependency lock committed.
- [x] Complete build and PostgreSQL integration run: https://github.com/Aayush20253534/Digimarket-software/actions/runs/39230018523

The tests use an ephemeral GitHub-hosted PostgreSQL database. No existing Neon project was modified.
