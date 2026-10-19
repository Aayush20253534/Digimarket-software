# Project charter — DigiMarket Software
**Status:** Module 0 specification | **Date:** 2026-10-19 | **Owner:** agency founders

## 1. Product vision
A private, mobile-responsive and desktop-first agency operating system: one organization, shared leads/clients, assigned work, content scheduling, asset management, finance, billing, approvals, and trustworthy reporting. The initial deployment serves a single digital marketing agency, not a commercial multi-tenant SaaS product.

## 2. Problems addressed
1. Leads and clients fragmented across personal sheets and conversations.
2. No authoritative view of approved expenses, received payments, receivables or profit.
3. Unclear ownership and status of deliverables, reels, social posts and recurring service obligations.
4. Client media, brand assets, contracts and permissions scattered across staff devices.
5. Administrators cannot reliably assign work, track approvals and audit changes.

## 3. Users
- **Super Admin:** initial trusted platform owner; user and authorization management.
- **Admin:** configured agency operational manager.
- **Founder:** leadership view within granted permissions (not automatically all-powerful).
- **Employee:** shared-workspace contributor with least-privilege access.
- **Optional later:** client portal user (excluded from v1).

Only provisioned users can sign in; no public signup.

## 4. Initial product scope
- Identity, user provisioning, permissions, audit history, team/founder descriptions.
- Shared lead pipeline with follow-ups, duplicate detection and conversion.
- Shared clients with contact, services, projects and linked financials.
- Expense/income submissions, admin-configurable categories, approvals, reports.
- Projects, deliverables, milestones and assigned tasks.
- Recurring tasks with deduplicated instances.
- Content calendar with draft, review, approval and manual publication status.
- Invoices, partial payments, receipts, outstanding balances and reminders.
- Cloudinary-backed secure asset library for media and documents.
- Client contribution/profitability, dashboard analytics and notifications.
- Redis-assisted caching and job queues; no financial truth in cache.

## 5. Scope boundaries / non-goals
- No payment gateway, direct social-platform publishing or client-facing login in v1.
- No payroll, statutory bookkeeping engine, automated tax filing or full double-entry accounting in v1. Ledger semantics and tax-specific invoices must remain extensible.
- No OCR-powered receipt extraction or AI-led sales scoring in v1.
- No native mobile app; responsive web app only.
- No direct storage of client social-network passwords inside client database fields.
- No guarantee of instant updates when a browser is offline; reconciliation occurs on reconnect.

## 6. Business success measures
- Every active lead has an owner, stage and follow-up or explicit disposition.
- Every client project has a responsible owner, due dates and auditable deliverables.
- Every approved expense and verified payment appears exactly once in reports.
- Every scheduled recurring task occurrence is generated at most once.
- Every protected file request is authorized and loggable.
- Company-wide and personal views reconcile with the same authoritative records.

## 7. Release strategy and acceptance
Module 0 delivers specifications only. Modules 1–17 add running application behavior. Each module has a DB/API/UI/security/test gate and an isolated Git commit. See 09-MODULE-ROADMAP and 10-ACCEPTANCE-CRITERIA.

## 8. Data policy
The organization owns agency records. Individual users are authors, assignees or approvers, not isolated tenants. Visibility is controlled by explicit permissions plus record-level checks. Store only necessary client personal data. Avoid attaching identity documents or third-party credentials without compelling operational need and authorization.

## 9. Key constraints and assumptions
- Stack is locked: Next.js, Express, Node.js, Neon PostgreSQL, Prisma, Argon2id/JWT, Redis, Cloudinary.
- Currency initially INR; use currency code on every monetary record.
- Timezone defaults to Asia/Kolkata for displayed schedules, UTC for persisted instants.
- One company workspace for initial launch, with organization_id in core models to prevent future migration pain.
- No configured credentials, hosting plans, organization legal details, invoice tax identifiers or production roles were supplied; do not fabricate them.

## 10. Immediate next step
Module 1 scaffolds actual web/API/workspace code from these contracts. Before production financial use, confirm business legal/tax details and the approval authority model.
