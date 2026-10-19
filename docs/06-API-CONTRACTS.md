# API conventions and endpoint catalog
**Version:** /api/v1 | **Style:** JSON REST with scoped resource controllers in Express. This is a contract proposal, not running code.

## Baseline HTTP rules
- JSON request/response, UTF-8, ISO 8601 UTC timestamps, ISO 4217 currency codes.
- IDs: UUID strings. Never trust organization_id from client; derive from authenticated session.
- Standard headers: Authorization via short-lived access JWT where appropriate; secure HttpOnly cookie strategy for browser refresh. Idempotency-Key required for specified mutation routes.
- HTTP: 200 success, 201 creation, 202 accepted background operation, 204 no content; 400 invalid JSON, 401 unauthenticated, 403 unauthorized, 404 unavailable record, 409 conflict, 422 validation/business rule, 429 rate limit, 5xx server error.
- Mutations validate Zod schemas server-side; reject additional unexpected financial fields.
- Record routes enforce record-level access in service layer after database scoped fetch.
- All endpoints rate-limited appropriately; auth, exports and upload signatures have stricter quotas.
- Every error and request log carries requestId; redact password, refresh token, client secrets and signed URLs.

## JSON envelope
Success:
~~~json
{
  "data": {"id": "uuid", "status": "PENDING"},
  "meta": {"requestId": "opaque-id"}
}
~~~
List:
~~~json
{
  "data": [{"id": "uuid"}],
  "page": {"nextCursor": null, "hasMore": false},
  "meta": {"requestId": "opaque-id"}
}
~~~
Error:
~~~json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{"field": "amount", "message": "Must be greater than zero"}]
  },
  "meta": {"requestId": "opaque-id"}
}
~~~
Errors must not leak whether a secret/client outside scope exists. Validation fields are safe, not raw client-submitted values.

## Pagination, filtering and concurrency
- Cursor-based pagination for large lists, limit default 25, maximum 100.
- Filters: ?status=, ?clientId=, ?ownerId=, ?from=, ?to=, ?cursor=, ?limit=; allowlist per endpoint.
- Date interval convention: from inclusive, to exclusive for timestamps. Daily filters use business timezone conversion.
- Optimistic concurrency: If-Match or explicit version on edit routes; stale update returns 409.
- Idempotency-Key on lead conversion, expense submission/posting, approval decisions, verified payments, allocations and generated invoice issuance. Scope uniqueness by org + actor + route/operation; persist original response metadata.

## Identity / organization
| Method | Route | Purpose | Permission |
| --- | --- | --- | --- |
| POST | /auth/login | Login ID/password | Public with rate limit |
| POST | /auth/refresh | Rotate refresh session | Valid refresh session |
| POST | /auth/logout | Revoke current session | Authenticated |
| POST | /auth/change-password | Password change | Authenticated |
| GET | /me | User profile, roles, permissions | Authenticated |
| GET | /users | Staff list | users.read |
| POST | /users | Provision staff member | users.create |
| PATCH | /users/:id | Update status/role via separate audited operation | users.update |
| POST | /users/:id/reset-password | Issue one-use temporary credential | users.reset |
| GET | /teams | List teams | teams.read |
| GET | /audit | Filter audit log | audit.read |

## Finance / approval
| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | /finance/categories | List/create authorized categories |
| PATCH | /finance/categories/:id | Update/archive category |
| GET/POST | /finance/transactions | Scoped list / draft or submit |
| GET | /finance/transactions/:id | Detail |
| PATCH | /finance/transactions/:id | Edit permitted unposted record |
| POST | /finance/transactions/:id/submit | Submit for approval |
| POST | /finance/transactions/:id/reverse | Controlled posted correction |
| GET | /finance/summary | Verified cash and status totals |
| GET | /finance/reports | Filtered transaction report |
| GET | /approvals | Authorized approval queue |
| POST | /approvals/:id/decision | Approve/reject/request changes |
| GET | /approvals/:id/history | Auditable decisions |

POST /finance/transactions example:
~~~json
{
  "kind": "EXPENSE",
  "amount": "185.00",
  "currencyCode": "INR",
  "categoryId": "uuid",
  "merchantOrSource": "Rapido",
  "occurredOn": "2026-10-19",
  "description": "Client visit",
  "clientId": null,
  "projectId": null,
  "paymentMethod": "UPI",
  "assetIds": []
}
~~~
Client-supplied creator, approval status, posted flag or organization ID is ignored/rejected.

## Leads and clients
| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | /leads | Shared list / create |
| GET/PATCH | /leads/:id | Detail / controlled edit |
| POST | /leads/:id/activities | Follow-up note or contact event |
| POST | /leads/:id/assign | Assign owner |
| POST | /leads/:id/convert | Idempotent create/link client |
| GET/POST | /clients | List / create |
| GET/PATCH | /clients/:id | Client detail / edit |
| GET/POST | /clients/:id/contacts | Contacts |
| GET/POST | /clients/:id/services | Service agreements |
| GET | /clients/:id/activity | Related activity timeline |

## Projects, tasks and content
| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | /projects | List/create |
| GET/PATCH | /projects/:id | Detail/change |
| GET/POST | /projects/:id/milestones | Milestones |
| GET/POST | /projects/:id/deliverables | Deliverables |
| POST | /deliverables/:id/submit | Submit for review |
| GET/POST | /tasks | List/create |
| GET/PATCH | /tasks/:id | Detail/change |
| POST | /tasks/:id/assign | Add/change assignee |
| GET/POST | /task-recurrences | List and configure rules |
| POST | /task-recurrences/:id/preview | Validate next occurrences |
| GET/POST | /content | List/create |
| GET/PATCH | /content/:id | Detail/change draft |
| POST | /content/:id/submit | Review revision |
| POST | /content/:id/publish-record | Record actual publication |
| GET | /content/calendar | Calendar-shaped scoped list |

## Cloudinary assets
| Method | Route | Purpose |
| --- | --- | --- |
| POST | /assets/upload-intent | Validate scope, return short-lived signed upload options |
| POST | /assets/confirm | Verify provider asset and create metadata |
| GET | /assets | Scoped list/search |
| GET | /assets/:id | Metadata and related references |
| POST | /assets/:id/authorized-download | Grant short-lived protected URL if authorized |
| POST | /assets/:id/link | Link to client/project/task/content |
| POST | /assets/:id/archive | Restrict and schedule retention-safe cleanup |

## Invoices and payments
| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | /invoices | List/create draft |
| GET/PATCH | /invoices/:id | Detail/edit draft |
| POST | /invoices/:id/issue | Lock and number issued invoice |
| POST | /invoices/:id/void | Authorized void with reason |
| GET | /invoices/:id/pdf | Authorized PDF access |
| GET/POST | /payments | Scoped list/record pending payment |
| POST | /payments/:id/verify | Verify received funds + finance posting |
| POST | /payments/:id/allocate | Apply amount to invoice, transactional |
| GET/POST | /billing-schedules | Recurring draft invoices |

## Reporting, team and notifications
| Method | Route | Purpose |
| --- | --- | --- |
| GET | /reports/company | Scoped company KPI |
| GET | /reports/sales | Lead conversion |
| GET | /reports/clients/:id/profitability | Client financial contribution |
| GET | /reports/projects | Project throughput |
| GET | /reports/content | Content pipeline |
| GET | /notifications | Current user's notifications |
| POST | /notifications/:id/read | Mark read |
| GET | /events | Authenticated SSE stream, minimal events |
| GET/PATCH | /founders | Authorized founder profiles |
| GET/PATCH | /settings/company | Company settings |

## API quality requirements
- OpenAPI 3.1 spec generated from source-of-truth contracts or maintained with CI validation.
- Unit tests on domain services; Supertest integration tests for authz, invalid inputs and conflicts.
- Make all resource ID and permission combinations testable before exposing production data.
- Stable error codes; no silent success if outbox/jobs have not completed.
