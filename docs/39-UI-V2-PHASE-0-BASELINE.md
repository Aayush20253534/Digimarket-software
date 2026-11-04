# DigiMarket UI v2 — Phase 0 baseline, route inventory and regression contract

**Status:** Phase 0 baseline. No navigation, theme, feature, permission, API, database or CSS changes in this phase.
**Repository:** `Aayush20253534/Digimarket-software`.
**Baseline source:** `apps/web/src/app/app` route tree, `workspace-navigation.tsx`, `app/layout.tsx`, `apps/api/src/auth/policies.ts`, and the existing Playwright suite. This is a source-code and isolated-CI baseline, **not** a verified screenshot of an authenticated production account.

## Approved UI v2 decisions (authoritative acceptance constraints)

1. Default **dark**, optional **light**; black/white/neutral palette; theme-appropriate main and nested scrollbars.
2. Status colours are **semantic only**. Keep the **original AmplifyWorld logo**.
3. Grouped, collapsible navigation; comfortable spacing; consistent professional iconography and accessible graphs.
4. Overview is **role-based**, balancing leads, finance, deliveries and today's work, using authorised real data.
5. Keep **Leads**, **Follow-ups**, **Meetings**, **Clients**, **Client Deliveries** distinct.
6. Merge **Task History** into Tasks; merge **Quotations** and **Agreements** into **Documents**.
7. Hide **Content Calendar** and **Notes** in normal UI, but **do not delete their records or old protected routes**.
8. Move **Files & Assets** into Clients, preserving access to unassigned/shared assets for authorised roles.
9. Place **Approvals** in a header inbox, preserving full-view deep links.
10. Keep **Reports** and **Messages** as standalone pages.
11. Relocate **Founders** and **ChatGPT CRM integration** into Settings.
12. Keep all existing RBAC/record scopes, clients, tasks, lead stages, financial treatment, documents/PDFs, exports, receipts, history and backend contracts.

## Current routes -> planned navigation / compatibility

The directory inventory is taken from the Next.js App Router `page.tsx` tree on main. A name in this table does **not** imply that every role has access.

| Current route | Current use | Target UI v2 location | Compatibility obligation |
|---|---|---|---|
| `/app` | App index | Overview | Redirect remains |
| `/app/dashboard` | Overview | Overview | Same address, role-based |
| `/app/leads` | Leads CRM | Leads CRM | Same address |
| `/app/follow-ups` | Follow-up register | Follow-ups | Same address |
| `/app/meetings` | Meetings register | Meetings | Same address |
| `/app/clients` | Clients directory | Clients | Same address |
| `/app/clients/[id]` | Client detail | Clients / [id] | Existing IDs and deep links must resolve |
| `/app/deliveries` | Service schedules | Client Deliveries | Same address |
| `/app/tasks` | Task workflows | Tasks / Active | Same address |
| `/app/task-history` | Completed task history | Tasks / History | Preserve old bookmarked URL via compatibility route or redirect |
| `/app/finance` | Income, expenses, Meta Ads | Finance | Same address and accounting scope |
| `/app/quotations` | Quotations | Documents / Quotations | Preserve old deep links and PDF downloads |
| `/app/agreements` | Agreements | Documents / Agreements | Preserve old deep links and PDF downloads |
| `/app/reports` | Business reports | Reports | Same address |
| `/app/reports/leads` | Lead breakdown | Reports / Leads | Preserve period/filter query strings |
| `/app/reports/[kind]` | Financial breakdown | Reports / [kind] | Preserve period/filter query strings |
| `/app/messages` | Team messages | Messages | Same address |
| `/app/notes` | Personal notes | Hidden | Keep protected route and persisted notes |
| `/app/notes/list` | Notes list | Hidden | Keep protected route and persisted notes |
| `/app/content` | Content calendar | Hidden | Keep protected route and scheduled records |
| `/app/assets` | Files and assets | Clients / Files & Assets | Existing shared/unassigned assets must remain reachable |
| `/app/approvals` | Approval workflows | Header inbox / full view | Preserve approval links and decision APIs |
| `/app/founders` | Founder responsibilities | Settings / Founders | Preserve existing grants and URL |
| `/app/integrations/chatgpt` | CRM integration | Settings / Integrations | Preserve authorised route |
| `/app/settings` | Company configuration | Settings | Same address |
| `/app/team/users` | Team administration | Settings / Team & Access | Preserve original URL |
| `/app/profile` | Personal profile | Header account menu | Preserve original URL |
| `/app/search` | Universal search | Header search | Preserve search scope and URL |
| `/app/notifications` | Notifications | Header notification center | Preserve history |
| `/app/billing` | Billing module | Finance / Billing (review) | Preserve protected route until migration |
| `/app/profitability` | Profitability module | Finance / Profitability (review) | Preserve protected route until migration |
| `/app/projects` | Projects module | Client Deliveries / Projects (review) | Preserve protected route until migration |

Other public/auth pages: `/`, `/login`, `/design-preview`, `/chatgpt/authorize`. These remain outside the authenticated workspace redesign; API gateway and PWA routes remain untouched.

**Do not turn "hide" into deletion.** Deleting menu entries, disabling navigation, removing route pages, revoking grants and deleting records are different operations. Phase 0 permits none of them.

## Role / route access baseline

The UI uses `permittedGroups(permissions, roles)` and `currentSection()` in `apps/web/src/components/workspace-navigation.tsx`. The underlying backend role defaults live in `apps/api/src/auth/policies.ts`. Do not rely on the 2026 project-charter role descriptions as an executable permissions matrix: explicit grants, object ownership, organisation scoping and route-level restrictions still govern access.

| Destination | Current navigation condition | Target visibility | Backend protection to retain |
|---|---|---|---|
| Overview, Profile | Authenticated session | Session-visible | Active session & organisation |
| Leads, Follow-ups, Meetings | `leads.read` | Each separately | Lead read scope, restricted operations |
| Clients, Deliveries | `clients.read` | Each separately | Client organisation/assignment checks |
| Tasks, Task History | `tasks.read` | One grouped Tasks destination | Own/assigned/manage task grants |
| Finance | `finance.entry.read.own` or `finance.read.all` | Finance | Own vs agency, funding attribution, approval gates |
| Quotations, Agreements | `FOUNDER` / `ADMIN` / `SUPER_ADMIN` role filter | Documents | Route validation, ownership and PDF history |
| Reports | `reports.business.read` | Reports | Reporting permission and data scoping |
| Messages, Notes, Profile | Session-level menu (individual endpoints validate access) | Messages, hidden Notes, Profile menu | Private data / recipient scope |
| Content, Assets | `content.read`, `assets.read` and current admin-operation UI restriction | Hidden calendar / Assets in Clients | Preserve record-level permission and visibility |
| Approvals | `approvals.read` | Header inbox + full view | Decision scope, separation of duties |
| Founders, Settings, Team | `founders.read`, `organization.settings.manage`, `users.read` | Settings subpages | Do not elevate by menu grouping |
| ChatGPT integration | Founder role in nav, with settings filter | Settings / Integrations | Preserve actual server-side authorisation |
| Global Search | `search.read` and current admin UI restriction | Header action | Scope results by entity permissions |

**Role profiles to test:** `SUPER_ADMIN`/`ADMIN`, `FOUNDER`, `EMPLOYEE`, anonymous. The existing `workspace.spec.ts` creates isolated CI Admin, Founder and Employee identities, tests their different views and exercises sensitive workflows. A link being visible is not equivalent to an API permission grant. Avoid changing backend grants as part of a visual redesign.

## Existing workflow regression matrix

| Workflow | Expected invariant | Existing coverage / future gate |
|---|---|---|
| Login and first-login password rotation | Secure session, no access without authentication | `apps/web/tests/workspace.spec.ts`, `public-auth.spec.ts`, auth API tests |
| Role-scoped navigation | No privilege escalation by a visual route/menu change | `workspace.spec.ts`, policies tests; expand checks in Phase 2 |
| Lead create, stage change, meeting and follow-up | Existing stages, contact actions and dates preserved | `workspace.spec.ts`; Phase 3 verify standalone pages |
| Approved lead to client | Conversion does not duplicate or lose client record | `workspace.spec.ts`, clients API tests |
| Client deliveries and recurrence | Schedules, assignees, approvals, due dates preserved | `workspace.spec.ts`, delivery tests; Phase 4 |
| Tasks and task history | Creation, assignment, completion, reopen, history retained | `workspace.spec.ts`, task API tests; Phase 4 |
| Self versus Client Meta Ads | Client spend excluded from agency net, combined Meta register only includes Meta categories | `apps/api/src/finance/meta-ads.scope.test.ts`; Phase 5 end-to-end |
| Finance approval, editing and export | Amounts, posted/pending scope, receipt links and audit preserved | `workspace.spec.ts` and finance API tests; Phase 5 |
| Quotations and agreements | Separate saved histories, adjustable reels/posts, PDF output, legal fields intact | Existing quotation tests; add document flow in Phase 5 |
| Reports and drilldowns | Never invent totals from a 10-row page; date filters, exports and client ad exclusions hold | `workspace.spec.ts`, report API tests; Phase 5 |
| Assets | Shared and client-assigned assets remain accessible based on grants | `workspace.spec.ts`; Phase 4 migration |
| Messages and notes | Messages remain; note records remain even when Notes is hidden | Existing UI/data tests; Phase 6 |
| Approvals | Full-view deep links and separation of duties remain functional | `workspace.spec.ts`, approval API tests; Phase 2 |
| Appearance | Theme switch persists; both palettes are usable; scrollbars match; no mobile overflow | Phase 0 screenshot evidence; Phase 1 visual/a11y gates |

## Phase 0 screenshot evidence

CI runs an isolated Postgres instance and bootstraps `admin-e2e`; **no real client data or credentials are used for screenshots**.

- `apps/web/tests/phase0-ui-baseline.spec.ts` captures current authenticated **admin** routes with dark/light desktop screenshots and representative tablet/mobile views.
- The existing `workspace.spec.ts` captures one current **founder** and one **employee** dashboard after each role has authenticated, without changing their workflows.
- Files are emitted to `apps/web/test-results/phase0-baseline/` and uploaded from **Module 4 Browser Integration** as `digimarket-ui-v2-phase0-baseline` for each CI run. The screenshot evidence is a CI artifact, not a permanent pixel-by-pixel approval test.
- A JSON manifest records role, route, theme, viewport, document overflow measurements and sidebar labels. This documents known layout defects without asserting that the existing UI is already perfect.
- The login/public pages already have responsive browser tests in `public-auth.spec.ts` and `design-preview.spec.ts`.

Because screenshots are taken against an ephemeral test database, they are reproducible and safe to share within the repository. They do **not** prove the live deployment's authenticated appearance, which requires a separate user-authorised browser review.

## Phase 0 gates and hand-off

- [x] Approved navigation and appearance decisions documented.
- [x] Current routes and backward-compatible redirect obligations inventoried.
- [x] Server-side role/grant differences and sensitive workflows identified.
- [x] Browser screenshot/measurement suite and CI artifact collection added.
- [x] Dependency-free route compatibility test added to main CI.
- [ ] Review generated screenshots once Module 4 Browser CI completes; document visual bugs before Phase 1.
- [ ] Validate actual staging/prod browser screenshots with authorised access before production sign-off.

**Phase 1 may replace styling, but must not modify the source-of-truth API contracts or accounting/role rules.** A future phase that changes UI route locations must keep the compatibility inventory green and update its semantic browser tests. Avoid freezing current corners, colours or legacy CSS selector names as long-term acceptance tests.
