# WhatsApp lead capture: AmplifyWorld CRM

## Behavior

- Each **new inbound message** on the configured Meta WhatsApp Business Cloud API number extracts the sender's phone number and creates a shared organization lead in **Pending**.
- Repeated messages from that number do not create new leads. Neither message contents nor attached media are stored in the CRM.
- Team members with CRM access can add contact name, business name, business type, and a status note.
- Statuses are **Pending → Meeting Process → Approved**. An Approved transition creates exactly one linked client in the same database transaction, without a separate approval request or client creation form.
- Historical lead activity is retained. The original lead remains accessible for audit.
- Only contacts that message **after webhook subscription** are captured. This does not read existing personal WhatsApp chats or message history.

## Required Meta configuration

Use an approved WhatsApp Business Platform / Meta Cloud API account. An ordinary WhatsApp or WhatsApp Business mobile app does not provide this webhook capability by itself.

1. In Meta for Developers, configure a WhatsApp app/business phone number and subscribe its WABA to **messages** webhook notifications.
2. Deploy the latest **API backend** on Render and run Prisma migrations. Webhook route must be publicly reachable via HTTPS on the Render API host.
3. Set the following **secret environment variables in Render only**. Do not commit credentials to Git or store them on the frontend:

| Name | Value |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Random secret of at least 16 characters. Enter the same value in Meta's webhook verification form. |
| `WHATSAPP_APP_SECRET` | The Meta app secret (not the Cloud API access token). Used to validate `X-Hub-Signature-256`. |
| `WHATSAPP_PHONE_NUMBER_ID` | Numeric WhatsApp Business phone number ID from Meta (not the actual phone number). |
| `WHATSAPP_ORGANIZATION_ID` | Existing workspace organization's UUID. |
| `WHATSAPP_CREATED_BY_USER_ID` | UUID of an active workspace user in that organization who will be recorded as the creator. |

4. In Meta, set callback URL to `https://YOUR-RENDER-API-HOST/api/v1/integrations/whatsapp/webhook` and the configured verify token.
5. Send a test message from a phone not already in the CRM. Confirm one Pending lead appears. Send a second message and verify no duplicate is created. Then transition the lead to Approved and verify that one client appears.

## Security and operational safeguards

- GET challenge validates the configured verification token and returns it only for an authenticated Meta verification request.
- POST body is verified using HMAC-SHA256 of the *raw request bytes* before parsing. The route has a 128 KB limit.
- Only `whatsapp_business_account` events with the configured `phone_number_id` and `messages` entries are accepted. Delivery receipts and unrelated phone numbers are ignored.
- Client and lead records remain organization-scoped; phone deduplication and transaction locks prevent simultaneous duplicate inserts.
- Do not expose app secrets, service role identity, or phone numbers in public logs. If the webhook returns 500, Meta may retry and deduplication prevents duplicate records.
- Without valid environment configuration, the webhook returns 503 and automatic WhatsApp capture remains unavailable. Manual phone-only lead entry remains available through the CRM.

## CRM lead source categories

- Leads created from incoming messages via the authenticated WhatsApp webhook are recorded as **Meta Leads**. This category denotes the WhatsApp/Meta capture channel, not proof of a paid ad click.
- Manually created leads require selecting **Cold Call** or **Meta Leads** in Add Lead. Imported CSV rows may include `source` with `COLD_CALL` or `META_LEADS`; missing source defaults to Cold Call.
- The rollout migration relabels existing `WHATSAPP` sources to `META_LEADS` and previously unclassified records to `COLD_CALL`. Existing phone-number matches remain unchanged and are not duplicated or automatically reclassified.
