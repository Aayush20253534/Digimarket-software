# DigiMarket UI v2 — Phase 2: navigation, header inbox and route grouping

Phase 2 reorganizes the authenticated workspace **without changing data, server routes or authorization contracts**. Every existing authenticated route is retained. The original AmplifyWorld logo and monochrome dark/light themes remain.

## Role-aware sidebar

| Group | Canonical destinations |
|---|---|
| Workspace | Overview |
| Sales & CRM | Leads CRM, Follow-ups, Meetings, Clients |
| Operations | Client Deliveries, Tasks |
| Business | Finance, Documents, Reports |
| Communication | Messages |
| Administration | Settings |

Groups can expand/collapse with a browser-local preference. The whole sidebar can still collapse to icons. Permissions use the existing user session; hiding an entry does not revoke backend rights.

Notes, Notes List and Content Calendar are hidden from normal UI. Their data and original protected URLs remain. Other merged module entries disappear only from the main navigation.

## Reorganized workflows

- **Tasks and History:** /app/tasks and /app/task-history display common Active Tasks / History tabs. Both original URLs work.
- **Documents:** /app/documents/quotations and /app/documents/agreements display tabbed navigation above the original forms. Historic /app/quotations and /app/agreements URLs retain their forms, PDFs and histories without copying data.
- **Clients / Assets:** the asset library moves to /app/clients/assets and each client workspace gains a Files & Assets section. Links from a client pass its existing clientId query filter; /app/clients/assets without a client filter shows all permitted assets, including shared and unassigned files. The original /app/assets route remains. Existing non-admin UI restriction and asset access grants remain in force.
- **Settings:** company settings, team management, founder responsibilities and integrations are grouped by the current grants under /app/settings. Each original settings module URL remains supported.
- **Header:** approval inbox, notifications, theme toggle, permitted search and account menu. The approval inbox uses the existing /approvals API, showing a permission-scoped pending queue or the user's own submitted requests. Requests link to the full /app/approvals page for decisions, which still uses the original confirmation, policy and reason requirements. Inbox previews never approve, reject or cancel automatically.
- **Hidden:** Notes, Content Calendar and old separate navigation entries. Nothing is deleted.

## Authorization contracts retained

- leads.read: Leads, Follow-ups and Meetings.
- clients.read: Clients and Client Deliveries.
- tasks.read: Tasks and History.
- finance.entry.read.own or finance.read.all: Finance.
- Founder, Admin or Super-admin role: Documents, with old per-page access checks.
- reports.business.read: Reports.
- assets.read plus existing non-admin UI restriction: Clients asset library.
- approvals.read: approval previews and full workflows; approvals.decide controls decision queue visibility.
- Settings hub links depend individually on organization.settings.manage, founders.read, users.read and the original founder integration rule.

No schema, API contract, server permission, accounting formula, PDF generator or database record has been changed.

## QA and rollout

The workspace browser suite now checks grouped navigation, hidden modules, collapsible groups, header inbox, merged Documents and old route compatibility. Phase 0 screenshot and route-compatibility checks stay in force.

Detailed individual page refinements remain scheduled for Phases 3–6. The full approvals page remains available for approval history, policies and decision actions.

Verify the final CI build and authenticated screenshots before claiming full production QA. A successful Vercel build alone does not prove every workflow.
