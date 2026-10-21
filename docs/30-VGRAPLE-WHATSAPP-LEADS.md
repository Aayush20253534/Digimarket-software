# VGraple CRM → AmplifyWorld Leads CRM (Coexistence)

## Purpose

Keep Amplify World's existing WhatsApp Business app number connected via VGraple Coexistence. A new direct **inbound** WhatsApp message should create one Pending lead in AmplifyWorld, without importing contacts or messages, duplicating existing leads/clients, or auto-replying.

## Receiver

POST \`https://YOUR-RENDER-API.onrender.com/api/v1/integrations/vgraple/webhook\`

**Use the actual Render API hostname, not the Vercel frontend URL.** This route is registered before Express JSON parsing to verify the exact raw bytes.

VGraple Settings → Webhooks → Add Endpoint:
- Endpoint URL: actual Render origin + \`/api/v1/integrations/vgraple/webhook\`
- Description: \`AmplifyWorld Leads CRM\`
- Events: **Message Received** only. Leave Contact Created, Lead Created, and all others unchecked.
- Copy the one-time endpoint signing secret privately after creation.

## Render-only configuration

\`\`\`env
VGRAPLE_WEBHOOK_SECRET=whsec_<generated-by-VGraple>
VGRAPLE_ORGANIZATION_ID=<UUID-from-AmplifyWorld>
VGRAPLE_CREATED_BY_USER_ID=<active-founder-user-UUID>
\`\`\`

If the same organization and active founder user are already configured for the separate direct Meta webhook, the receiver can fall back to \`WHATSAPP_ORGANIZATION_ID\` and \`WHATSAPP_CREATED_BY_USER_ID\`. **Meta app secret and phone-number ID are not needed for this VGraple route**. Keep the original Meta integration independent.

Store the signing secret only in Render's secret environment; it is not a Meta verify token. The endpoint rejects requests if configuration or HMAC verification is missing or invalid.

## Safety and acceptance tests

- VGraple signs request bodies using \`X-Signature-256: sha256=<hex>\`; newer deliveries may also send \`X-Webhook-Signature: t=<unix-seconds>,v1=<hex>\`. The receiver prefers the timestamped signature with a five-minute tolerance and supports the raw-body signature.
- Only fresh \`message.received\` events with \`data.message.direction=inbound\`, \`data.message.channel=whatsapp\`, and a valid \`data.contact.phone\` may create leads. Test events, group markers and messages older than one hour are ignored.
- The shared LeadsService performs transactional phone dedupe, excludes deleted leads from recreation, checks existing client numbers, and stores **no message body**.
- The VGraple **Test** button should yield HTTP 200 but \`processed: 0\` (test events never create leads).
- After setup, send a new direct message from a number not already recorded. Expect one PENDING lead. Repeat from the same number; expect no new lead. Existing WhatsApp Business app should continue working.
- If deliveries fail, inspect VGraple webhook delivery logs; do not disable signature checks.
- No historical 801-contact import is performed by the integration.

## Deployment

Push GitHub changes, deploy the API service to Render (autodeploy is disabled), install the private env values, then enable/test the endpoint. Do not create an active VGraple endpoint before the API receiver is deployed and configured; failed responses can trigger retries.
