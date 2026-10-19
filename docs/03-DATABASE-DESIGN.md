# Database design — conceptual PostgreSQL / Prisma model
**Module 0 design only.** This is a schema specification, not a Prisma migration. Tables introduced incrementally by module owner. Source of truth: Neon PostgreSQL.

## Common conventions
- Primary keys: UUIDs (generated in application/DB consistently); never expose sequential internal identifiers as proof of authorization.
- All organizational tables include organization_id FK; uniqueness usually scoped by organization.
- Audit columns: created_at, updated_at, created_by where applicable; created_at persisted as UTC TIMESTAMPTZ.
- Include deleted_at / archived_at only for entities where legal history requires retention. Do not cascade-delete financial history.
- Money: NUMERIC(19,4) / Prisma Decimal plus 3-letter currency_code; explicitly define rounding at posting/export. Never JavaScript floats for money.
- Version integer on frequently edited records for optimistic concurrency.
- Enumerations may be database enums or lookup types; unknown statuses must fail closed.
- PII, tokens and secret material never included in general-purpose search indexes or logs.
- Organization_id scope enforced in service authorization, optionally add PostgreSQL RLS later as defense-in-depth.
- Foreign keys protect referential integrity. Uniqueness and check constraints enforce idempotency and nonnegative allocations.

## Core identity and organization (Modules 2–4)
| Table | Required identifiers and fields | Key constraints |
| --- | --- | --- |
| Organization | id, name, timezone, default_currency | timezone IANA; default_currency ISO 4217 |
| User | id, organization_id, login_id, display_name, email?, password_hash, status, must_change_password, auth_version | unique (org, lower(login_id)); password_hash never returned |
| Role | id, organization_id?, key, label, system_role | unique scope+key; system roles guarded |
| Permission | key, description | immutable unique permission key |
| UserRole | user_id, role_id | unique pair |
| RolePermission | role_id, permission_key | unique pair |
| Session | id, user_id, refresh_token_hash, expires_at, revoked_at?, last_used_at, device_label? | indexed user_id, expiration |
| Team | id, organization_id, name, lead_user_id? | unique active name per org |
| TeamMember | team_id, user_id | unique pair |
| FounderProfile | id, organization_id, user_id?, display_name, title, responsibilities, sort_order | may describe founder before user account exists |
| AuditLog | id, organization_id, actor_id?, action, entity_type, entity_id, before_redacted?, after_redacted?, request_id, created_at | append-only, indexed org/time/entity |
| OutboxEvent | id, organization_id, kind, aggregate_type, aggregate_id, payload_minimal, published_at?, attempts | indexed unpublished+created_at |
| Notification | id, organization_id, recipient_user_id, type, reference_type, reference_id, read_at? | indexed recipient/unread |
| NotificationPreference | user_id, event_type, in_app, email? | unique user+event |

## Leads and clients (Modules 7–8)
| Table | Main columns | Integrity |
| --- | --- | --- |
| Lead | id, org, business_name, contact_name?, normalized_phone?, business_type?, location?, source?, status, assigned_user_id?, next_follow_up_at?, converted_client_id?, created_by | unique conversion relation; indexed stage/owner/followup |
| LeadActivity | id, lead_id, actor_id, kind, note?, event_at, metadata | append-only |
| LeadDuplicateCandidate | lead_id, possible_duplicate_id, match_reason, resolved_at? | pair unique; never auto-merge without review |
| Client | id, org, display_name, legal_name?, business_type, phone?, email?, address?, website?, instagram_url?, status, account_manager_id?, former_lead_id? | unique former_lead_id (nullable); indexed status/account manager |
| ClientContact | id, client_id, name, phone?, email?, role?, is_primary | one primary by partial unique index |
| ClientService | id, client_id, service_type, start_date?, end_date?, billing_type, agreed_rate?, currency_code, status | independent service agreements |
| ClientActivity | id, client_id, actor_id, kind, note?, created_at | append-only |
| ClientVaultRef | id, client_id, label, provider, external_secret_ref?, access_policy_id? | reference only; no plaintext social password |

## Approvals and finance (Modules 5–6)
| Table | Main columns | Integrity |
| --- | --- | --- |
| ApprovalPolicy | id, org, entity_type, min_amount?, max_amount?, approver_role_id?, steps_json?, self_approval_allowed=false, active | version policies, don't retroactively mutate open requests |
| ApprovalRequest | id, org, entity_type, entity_id, requester_id, policy_snapshot, status, current_step, submitted_at, resolved_at? | unique active request per entity/version |
| ApprovalDecision | id, approval_request_id, approver_id, decision, reason?, created_at | immutable; atomic step transitions |
| FinancialCategory | id, org, kind(INCOME/EXPENSE), name, parent_id?, is_active | unique org+kind+normalized name |
| FinancialTransaction | id, org, kind, category_id, merchant_or_source?, amount, currency_code, occurred_on, entered_by, client_id?, project_id?, payment_method?, status, approval_request_id?, linked_payment_id?, reversal_of_id?, description?, version | amount > 0, currency required, unique external/source idempotency key, no hard deletion of posted |
| FinancialAttachment | financial_transaction_id, asset_id | unique pair |
| PaymentAccount | id, org, label, type, active | internal classification, not bank connectivity |
| FinancialAdjustment | id, org, original_transaction_id, corrected_transaction_id?, reason, approved_by? | immutable trace |
**Important:** No double count between payment-linked transaction and freeform income. A verified client payment is represented in Payment and creates exactly one associated posted finance receipt, linked by unique payment_id.

## Projects, tasks and assets (Modules 9–11)
| Table | Main columns | Integrity |
| --- | --- | --- |
| Asset | id, org, uploaded_by, cloudinary_asset_id, public_id, resource_type, delivery_type, format, bytes, version, mime_type, visibility, checksum?, status | unique Cloudinary asset ID; forbidden unrestricted private URL |
| AssetVersion | id, asset_id, cloudinary_asset_id, public_id, version, created_by | reference old versions safely |
| AssetLink | id, asset_id, target_type, target_id, purpose | app-layer target type validation; prefer FKs for primary link |
| AssetFolder | id, org, parent_id?, client_id?, name, visibility | logical folder tree; validate no cycles |
| Project | id, org, client_id, name, service_type, owner_id, start_at?, due_at?, budget_amount?, currency_code?, status, version | check date ordering; indexed client/owner/status |
| ProjectMember | project_id, user_id, role | unique pair |
| Milestone | id, project_id, name, due_at?, status, sort_order | ordered within project |
| Deliverable | id, project_id, title, due_at?, status, approval_request_id?, submitted_by?, submitted_at? | approval-gated final status |
| Task | id, org, project_id?, client_id?, title, description?, priority, status, due_at?, created_by, completed_at?, recurrence_id?, occurrence_key?, version | unique (recurrence_id, occurrence_key) when recurrence exists |
| TaskAssignment | task_id, user_id, assigned_by, assigned_at, completed_at? | unique pair |
| TaskComment | id, task_id, author_id, body, created_at | append-only / edit audit |
| TaskChecklistItem | id, task_id, title, done, sort_order | sort within task |
| RecurrenceRule | id, org, template_task_id, timezone, rrule, starts_at, ends_at?, enabled, last_generated_at? | supported recurrence subset validated |
| TaskAttachment | task_id, asset_id | unique pair |

## Content (Module 12)
| Table | Main columns | Integrity |
| --- | --- | --- |
| ContentItem | id, org, client_id, project_id?, owner_id, platform, format, caption?, hashtags?, planned_at?, status, published_at?, published_url?, version | planned date and publication event distinct |
| ContentRevision | id, content_item_id, version, caption_snapshot?, submitted_by, created_at, summary? | immutable revision history |
| ContentAsset | content_item_id, asset_id, purpose, sort_order | unique relation |
| ContentReview | id, content_item_id, revision_id, approval_request_id?, submitted_at?, resolved_at? | revision-bound approval; edits can invalidate approval |

## Billing (Module 13)
| Table | Main columns | Integrity |
| --- | --- | --- |
| Invoice | id, org, client_id, invoice_number, issue_date?, due_date?, currency_code, status, subtotal, discount, tax_total, total, version, pdf_asset_id? | unique (org, invoice_number); totals from items/adjustments |
| InvoiceLine | id, invoice_id, description, quantity, unit_price, discount?, tax_rate?, amount | amount computed in service and verified |
| Payment | id, org, client_id, amount, currency_code, received_at, method, reference?, verified_by?, verified_at?, status, proof_asset_id?, financial_transaction_id? | one posted finance transaction per verified payment |
| PaymentAllocation | payment_id, invoice_id, amount | unique pair; positive allocation; sum allocations <= verified payment amount and invoice balance |
| InvoiceAdjustment | id, invoice_id, type, amount, reason, created_by | audit, credit-note strategy; do not silently edit issued invoice |
| BillingSchedule | id, org, client_id, service_id?, cadence, timezone, next_run_at, enabled | unique schedule+occurrence invoice idempotency key |

## Analytics, views and indexes (Modules 14–16)
- Report queries aggregate posted transactions, verified payments, invoices and direct cost assignments only; views must state methodology.
- Indexed examples: Lead(org_id,status,next_follow_up_at), Task(org_id,status,due_at), Invoice(org_id,client_id,due_date), FinancialTransaction(org_id,occurred_on,status,kind), ContentItem(org_id,client_id,planned_at), OutboxEvent(published_at,created_at).
- Use cursor pagination for high-volume activity records. Partitioning only if actual volume merits it.
- Avoid materialized summary drift: if summaries are introduced, document recomputation and reconciliation.

## Relational overview
~~~mermaid
erDiagram
  Organization ||--o{ User : contains
  Organization ||--o{ Client : serves
  Organization ||--o{ Lead : tracks
  User ||--o{ TaskAssignment : assigned
  Lead o|--o| Client : converts
  Client ||--o{ Project : has
  Client ||--o{ Invoice : billed
  Client ||--o{ ContentItem : publishes
  Project ||--o{ Task : organizes
  Project ||--o{ Deliverable : delivers
  Invoice ||--o{ InvoiceLine : items
  Invoice ||--o{ PaymentAllocation : allocated
  Payment ||--o{ PaymentAllocation : allocates
  Organization ||--o{ FinancialTransaction : records
  Asset ||--o{ AssetLink : referenced
~~~

## Migration order
1. Organization, User, Role, Permission, Session, AuditLog, OutboxEvent.
2. ApprovalPolicy, ApprovalRequest, ApprovalDecision.
3. FinancialCategory, FinancialTransaction.
4. Lead/Client and conversion relations.
5. Asset, Project, Task/Recurrence and Content.
6. Invoice, Payment and allocation.
7. Reporting indexes and read-optimized views.

## Specific edge cases to test
- Two workers converting same lead at once.
- Two payments against same invoice under concurrent requests.
- Approver rejecting an already-approved expense.
- Disabled user with valid JWT claims.
- Cross-client asset retrieval with guessed IDs.
- Repeated BullMQ job execution on same recurrence occurrence.
- User/client archival when linked to issued invoices.
- Rounding with partial payments and mixed currencies (reject unsupported cross-currency allocation until FX model added).
