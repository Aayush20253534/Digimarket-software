# Module 15: Founders, Company Settings and Governance

## Implemented
- A dedicated `/app/founders` leadership directory with ordered, active/inactive founder profiles. Each profile has display name, functional title, responsibilities, optional link to an active organization staff account, optimistic version and audit events.
- **Crucial separation**: descriptive titles and profile links never write UserRole, Role, RolePermission or session claims. `FOUNDER` / `ADMIN` rights are granted only by the existing permission system. Employees with `founders.read` see active directory entries; `founders.edit` allows a privileged editor to see/restore hidden entries.
- Existing staff links are restricted to active users in the same organization and unique across all founder profiles, including inactive ones. Linking a user does not change their account role.
- `/app/settings` is available to organization settings managers. It supports version-checked company display name and validated IANA timezone. Currency is deliberately **read-only INR** because existing billing/finance only supports INR; updates cannot silently re-denominate financial records.
- Settings include persistently stored invoice-prefix, default payment terms and payment instructions. Prefix is uppercase alphanumeric, 2–12 characters; default due terms are 0–365 days. The invoice issuance transaction uses the saved prefix for **future numbers only**, while the organization-wide invoice counter remains monotonic and historical issued invoice numbers/PDF snapshots remain unchanged.
- `GET /api/v1/billing-defaults` is allowed for invoice authors and prefills new invoice due date and notes; it does not expose broader company administration. The default settings record is virtual until first edit and subsequently persisted with version-based conflict checks.
- Settings screen summarizes active income/expense category counts, active approval policies and recurring billing schedules, linking to the **existing** finance, approval and billing control screens rather than introducing competing category/policy records.
- Every settings mutation is organization-scoped, authenticated, validation-checked and audited. Versioning prevents stale overwrites; billing settings and org settings generate minimal outbox events without shipping sensitive payment instructions.

## API endpoints
- `GET /api/v1/founders` — requires `founders.read`
- `GET /api/v1/founders/eligible-staff` — requires `founders.edit`
- `POST /api/v1/founders`, `PUT /api/v1/founders/:id` — requires `founders.edit`
- `GET /api/v1/company-settings`, `PUT /api/v1/company-settings` — requires `organization.settings.manage`
- `PUT /api/v1/company-settings/billing` — requires `organization.settings.manage`
- `GET /api/v1/billing-defaults` — requires `invoices.draft`
- Legacy finance category/approval policy endpoints retain their existing permissions.

## Database and permissions
- Migration `20261020040000_founders_settings` adds Organization.settingsVersion, FounderProfile.version/isActive and a new one-to-one OrganizationBillingSettings model. No existing founder profiles or organization identities are fabricated by migrations or seeds.
- Add explicit `founders.read` grant to employees and privileged system roles; `founders.edit` to ADMIN/FOUNDER/SUPER_ADMIN, and `organization.settings.manage` to ADMIN/SUPER_ADMIN. The FOUNDER title does not authorize company configuration writes.
- `packages/db/src/seed.ts` upgrades existing system roles idempotently. Run it after migrations in real deployments; only adds specified system-role grants, never touches custom roles.

## QA
- CI workflow `.github/workflows/module15-settings.yml` runs migrations/drift, full repo lint/test/typecheck/build and live PostgreSQL integration tests for access isolation, stale versions, no privilege escalation by founder linkage, duplicate staff association, validation, change of invoice prefixes without mutating past invoices, billing defaults and audit.
- Module 13/14, finance and approvals integration tests run for regression.
- Production deployment is not part of Module 15. Modules 16–17 still require search/notifications, security/operational review, secrets, Neon/Cloudinary/Redis and a live deployment.
