# Decision log, assumptions and pending business policy
**Updated:** 2026-10-19

## Agreed stack / scope (locked unless product owner changes it)
| Decision | Choice | Rationale |
| --- | --- | --- |
| D-001 | Next.js + TypeScript web | Responsive application |
| D-002 | Express on Node.js + TypeScript | Clear backend service boundaries |
| D-003 | Neon PostgreSQL + Prisma | Relational integrity and typed persistence |
| D-004 | Argon2id + JWT sessions | Secure password hashing and stateless access with revocable refresh |
| D-005 | Redis + BullMQ | Caching, rate limiting and recurring job queue |
| D-006 | Cloudinary for files | Media processing and document storage, secure access control |
| D-007 | Admin-provisioned user accounts | Internal-only staff application |
| D-008 | Shared workspace, restricted sensitive data | Team collaboration with privacy controls |
| D-009 | Expense and income with admin-defined categories | Reconciled company reporting |
| D-010 | Combined lead and client CRM | One prospect-to-client lifecycle |
| D-011 | Daily and recurring tasks | Operational accountability |
| D-012 | Project management and content calendar | Client service delivery |
| D-013 | Invoice, payments, approvals and client contribution | Business oversight |
| D-014 | Founders page | Visible leadership responsibilities, not authorization |
| D-015 | Plan-first Module 0; implement through Modules 1–17 | Controlled incremental delivery |

## Architecture defaults proposed for implementation
| Decision | Default | Change trigger |
| --- | --- | --- |
| ADR-001 | Modular monolith API | Measured scaling/deployment bottleneck |
| ADR-002 | Single company organization in v1 | SaaS multi-tenant product requirement |
| ADR-003 | INR default; other currencies recorded separately | FX-enabled reporting requirement |
| ADR-004 | All instants UTC; display Asia/Kolkata | New organization's timezone |
| ADR-005 | Founder title independent of permission role | Signed-off staff permission policy |
| ADR-006 | Payment recorded → verified → allocated | Accounting workflow revision |
| ADR-007 | Authenticated Cloudinary delivery for sensitive assets | Formal media classification exceptions |
| ADR-008 | Manual publication in content module | Approved social API integration |
| ADR-009 | Individual recurring invoice drafts | Explicit auto-issuance approval |
| ADR-010 | Partial payment support | Contract-specific additional rules |

## Open decisions (do not fabricate)
1. **Legal company name / billing entity / address:** Required for production invoices and any tax details.
2. **Tax setup:** GST registration status, applicable invoice tax fields and numbering convention; consult accountant for final tax treatment.
3. **Approver hierarchy:** Who can approve what types and spending amounts, including founder overrides?
4. **Cash entry semantics:** Does a staff-submitted income entry represent collected funds, or an expected payment? Default to pending verification until authorized.
5. **Salary/labor cost:** Do employee labor hours count toward client profit reports? Default to direct external costs only unless configured.
6. **Overhead allocation:** Decide whether/how shared software costs are allocated to client margin.
7. **Secure credential workflow:** Prefer delegation; choose a reputable dedicated secrets service only if client accounts require password custody.
8. **Cloudinary limits:** Confirm paid tier/budget, allowed video sizes, file type policy, retention and transfer/bandwidth limits.
9. **User count and access model:** Number of employees, private projects, agency divisions and future external collaborators.
10. **Notification channels:** In-app is default; email/WhatsApp automation requires separate provider, consent and cost review.
11. **Brand/UI identity:** Name DigiMarket is repository working title; agency logo, final domain and palette require confirmation.
12. **Rollout environment:** Production domain, hosting credentials, Redis provider and Neon organization.
13. **Financial close and retention policy:** How long to preserve invoices, receipts and audit logs.
14. **Project completion rule:** Whether mandatory deliverables must be approved for completion in every service category.

## Default resolution discipline
- Pending choices do not block Module 1 scaffolding.
- Do not silently convert proposed options into production business rules.
- Record every clarified decision here, note date and affected modules.
- For security or data integrity, choose deny-by-default until policy is confirmed.
- If a requested enhancement affects accounting truth, update PRD, DB model, API and acceptance test together.

## Handoff to Module 1
1. Create workspace skeleton with actual package manifests and lockfile.
2. Implement web/API health endpoints and CI.
3. Document local setup and dev/test commands.
4. Add only empty env templates; never provider credentials.
5. Respect Module 0 design, create ADR when implementation legitimately differs.
