# Authorization specification
**Design:** deny-by-default, API-enforced RBAC + organization isolation + object-level access. Role descriptions are defaults, not automatic data entitlements. Super Admin is a privileged break-glass role, carefully audited.

## Role profiles
- **Super Admin:** initial trusted owner; can manage policies, all users, critical finance and audit.
- **Admin:** staff/admin workflows and agency configuration; financial approval only if explicitly assigned.
- **Founder:** business leadership; permissions assigned by policy, not inferred from founder title.
- **Employee:** shared leads, permitted clients/projects/tasks, own entries; no automatic financial aggregate or secret access.

## Legend
A = default allow (subject to record scope), O = own/assigned, P = explicit policy/grant, — = denied by default.

| Permission | Super Admin | Admin | Founder | Employee |
| --- | :---: | :---: | :---: | :---: |
| users.create / disable / reset | A | P | P | — |
| roles.manage / policies.manage | A | P | — | — |
| audit.read | A | P | P | — |
| leads.read / create | A | A | A | A |
| leads.edit | A | A | A | O |
| leads.assign / convert | A | A | P | P |
| clients.read | A | A | A | P/O |
| clients.create / edit | A | A | P | P/O |
| clients.secrets.request | A | P | P | — |
| clients.secrets.reveal | P | P | P | — |
| finance.entry.create | A | A | A | A |
| finance.entry.read.own | A | A | A | A |
| finance.read.all | A | P | P | — |
| finance.category.manage | A | P | P | — |
| finance.approve | A | P | P | — |
| invoices.read / issue | A | P | P | P/O |
| payments.record | A | P | P | P |
| payments.verify | A | P | P | — |
| projects.create / assign | A | A | P | P |
| projects.read / update | A | A | A | O |
| tasks.create / assign | A | A | P | P |
| tasks.update.own | A | A | A | O |
| tasks.recurrence.manage | A | P | P | — |
| content.create / edit | A | A | A | P/O |
| content.approve | A | P | P | — |
| assets.upload | A | A | A | P/O |
| assets.read | A | A | A | P/O |
| assets.delete | A | P | P | — |
| reports.business.read | A | P | P | — |
| founders.edit | A | P | P | — |
| organization.settings.manage | A | P | — | — |

## Record-level rules
1. Every record belongs to one organization. A caller cannot specify another organization's ID to bypass scope.
2. An employee's leads.read allows shared basic lead details; private activity and bulk export require additional authorization.
3. Client record access requires either clients.read across organization or explicit account-team assignment.
4. An assigned task grants access to task metadata, not automatically to all client financials, receipts or credentials linked to the task.
5. A project member may read project's permitted assets but must pass asset-specific visibility constraints.
6. finance.entry.read.own is based on created_by/submitter, not on who paid or client association.
7. Recording income is not equivalent to verifying received funds; finance approvals are independent.
8. A founder profile is informative; it does not mutate user roles.
9. Explicit client secret reveal requires separate authorization, audit and ideally additional verification.
10. Bulk export is a separate permission and logs who exported what scope.

## Approval segregation
- Request submitter cannot approve their own submission by default.
- An approval must be by a different authorized principal unless policy explicitly permits self-approval and audit records it.
- Approver may be selected via role, team, amount range and type.
- Policy snapshot is preserved per request; later policy edits do not silently alter pending requests.
- System-level administrator access to finance approvals is still logged and reviewable.

## Backend guard convention
1. authenticate() determines user_id, org_id, session version.
2. requirePermission("domain.action") checks permission grants.
3. service.canAccessRecord(user, record, action) checks organization, assignment, ownership and sensitivity.
4. retrieve a filtered projection (redact secret fields) rather than fetch-all-then-hide in UI.
5. audit materially sensitive reads/actions where justified.

## Search and notifications
- Global search returns only entities readable by requester; never include passwords, tokens, hidden financial columns or raw PII in universal indexes.
- SSE event audiences are scoped to permission/assignment and contain minimum identifiers, not complete sensitive data.
- Asset access and report exports must recheck requester permissions at time of request.
- Changing roles or disabling accounts revokes/invalidates sessions and relevant caches.

## Admin provisioning
- Bootstrap first Super Admin by an explicit one-time privileged setup step, not public signup.
- Admin creates login ID, temporary password and role; mandate first-login password change.
- Admin can reset password but cannot retrieve prior passwords.
- Privileged accounts require MFA before production use.

## Test matrix baseline
- [ ] Anonymous blocked from business APIs.
- [ ] Employee cannot read company-wide financial totals.
- [ ] Employee cannot approve own submitted expense.
- [ ] Cross-organization client ID always forbidden or indistinguishable not-found.
- [ ] Project membership does not expose client secret.
- [ ] Revoked session rejected before JWT expiry as per auth version/session check.
- [ ] Bulk export requires explicit permission.
- [ ] Super Admin privileged operation creates audit trail.
