# Sitemap, UI design and screen specifications
**Approach:** desktop-first, accessible responsive design. Module 0 provides design rules and low-fidelity wireframes; Next.js pages and real components begin in Modules 1–4.

## Design system
- Tone: modern professional work SaaS; calm neutral canvas; minimal marketing gradients.
- Typography: Inter or compatible system sans serif; scale 12, 14, 16, 20, 24, 32 px.
- Color tokens (proposal, verify contrast in implementation): primary #315EFB, success #17803D, warning #A16207, danger #B42318, light bg #F8FAFC, surface #FFFFFF, ink #0F172A, muted #64748B, border #E2E8F0.
- Spacing: 4 px base, common 8/12/16/24/32. Border radius 8–12 px.
- App shell: sticky top search/action/notification bar; 240 px collapsible side nav; content max width 1440 px.
- Layout: 12-column desktop grid, 2 columns tablet, 1 column mobile; sidebar becomes drawer on mobile.
- Accessible 44x44 px approximate action targets on touch, visible focus rings, semantic labels, tables with keyboard navigation, no status by color alone.
- Each record page: title + status + primary action; overview; tabs; timeline/audit; related records; permissions-safe actions.
- Never show mock financial numbers on a production dashboard; loading/skeleton/empty/error states required.

## Navigation hierarchy
~~~text
/auth/login
/auth/change-password
/app/dashboard
/app/finance
  /expenses  /income  /transactions  /categories  /reports
/app/leads
  /new  /[leadId]
/app/clients
  /new  /[clientId] (/overview /contacts /services /projects /files /billing /activity)
/app/projects
  /new  /[projectId]
/app/tasks
  /my-tasks  /team  /recurring
/app/content-calendar
  /new  /[contentId]
/app/assets
  /[assetId]
/app/invoices
  /new  /[invoiceId]
/app/payments
/app/reports
  /company  /sales  /finance  /projects  /content  /profitability
/app/founders
/app/team
  /users  /roles  /teams
/app/approvals
/app/notifications
/app/settings
  /company  /categories  /policies  /profile  /security
~~~
Routes represent intended design, not implemented pages. Next.js route groups may omit /app prefix in final public URLs if decided during Module 1; maintain a documented route manifest.

## Page requirements / components
| Page | Main UI | Primary actions | Typical visibility |
| --- | --- | --- | --- |
| Login | login ID/password, error, first-login redirect | Sign in | Public |
| Dashboard | KPIs scoped to user, tasks due, follow-up alerts, activity | Quick add | All users |
| Finance overview | verified inflow/outflow, pending, tabs and charts | Add entry, export | Authorized |
| Expense/Income forms | amount, category, date, merchant/source, client/project, receipt | Submit, save draft | All with entry.create |
| Approvals queue | pending requests, origin, reviewer comments | Approve/reject/return | Approvers |
| Leads list/detail | stage board/table, filters, owner, timeline, follow-ups | Add, assign, convert | Lead roles |
| Clients list/detail | list, contact/service tabs, related records, activity | Create, edit, archive | Client roles |
| Projects | kanban/list, milestones, deliverables, members | Create, assign, submit | Project roles |
| Tasks | my/team list, due and priority, recurrence rules | Complete, assign, recur | Assigned/admin |
| Content calendar | month/week/list, client/platform/status filters | Add content, review | Content roles |
| Asset library | folders, thumbnail grid, preview, upload/version | Upload, link, authorize download | Scoped roles |
| Invoices | invoice register, editor, line items, PDF, status | Issue, void, record payment | Billing roles |
| Payments | client, reference, allocations, verified status | Verify, allocate | Authorized |
| Reports | filters, trend charts, KPI definitions, downloadable summary | Filter, export | Scoped |
| Founders | roles, responsibilities and team connections | Edit (authorized) | Signed-in |
| Team | users, role grants, teams, disable/reset | Provision, revoke | Admin |
| Settings | company, categories, policies, profile, security | Update settings | Authorized |

## UX contracts
- Every list supports search, filters, sort, page/cursor, empty state and permission-filtered export.
- Every money amount displays currency, precision and its status (draft/pending/posted).
- Every invoice shows total, applied payments and remaining balance explicitly.
- Lead duplicate candidate is a warning with explicit merge decision, not silent removal.
- Stage transition dialogs collect required justification where configured.
- Tasks show personal timezone and overdue indicators; recurrence editor previews next 5 occurrences.
- Content card displays scheduled time, platform, owner, approval status, attached asset preview.
- Asset previews respect visibility and signed expiration; failed access shows neutral error.
- Approvers see before/after summary, request context and comments; action disabled when stale.
- Form mutation buttons have loading states, error recovery and safe retry/idempotency token when financial.
- Modal/dialog forms accessible via keyboard, trap focus and allow cancel.
- Status labels written in text in addition to color; icons do not replace labels.

## Global dashboard metric definitions
- **Available/verified cash movement** = posted cash inflows minus posted cash outflows in period.
- **Pending expense** = sum submitted but unapproved expense records, excluded from posted cash movement.
- **Receivables** = issued invoice total less applied verified payments/credits, excluding void invoices.
- **Leads due** = leads with next_follow_up_at <= now and active status.
- **Tasks overdue** = incomplete tasks with due_at < now, respecting timezone display.
- **Content scheduled** = approved scheduled entries planned in selected timeframe.
Every dashboard query must apply requester access and selected date filters.

## Empty/loading/error states
- Empty: clear message and authorized "Add" button; no fake samples displayed as real data.
- Loading: skeleton cards/table rows; preserve selected filters.
- Error: inline retry and request correlation ID; never expose server stack traces.
- Offline or live-disconnected: subtle status; refetch on reconnect.

## Wireframes
See wireframes/README.md for login, app shell, finance, CRM, client, project/task, content calendar, assets and invoicing low-fidelity diagrams.

## Navigation/access note
Sidebar visibility is a convenience, not an authorization measure. Backend permission checks determine every operation.
