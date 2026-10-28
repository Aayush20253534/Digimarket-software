# AmplifyWorld CRM × ChatGPT private MCP

## Implementation
- Streamable HTTP MCP endpoint: https://digimarket-software.onrender.com/api/v1/integrations/chatgpt/mcp
- OAuth 2.1 authorization code + PKCE (S256), dynamic client registration, five-minute single-use codes, 15-minute hashed access tokens, rotated hashed refresh tokens, 30-day refresh lifetime.
- Active founders authorize through existing AmplifyWorld authentication. Enrolled MFA is checked at consent. Grants re-check active founder status and roles every time. Admins can revoke but cannot access CRM tools.
- Tools use existing Prisma LeadsService and ClientsService, not unrestricted SQL. Contact phone numbers are redacted except with crm.contacts.read.
- Every write requires confirmed=true, an idempotency UUID and appropriate original CRM permission; updates need the current version. Pending or uncertain results never replay automatically.
- Meta advertising data remains separate through Windsor.ai. Source META_LEADS alone does not prove paid campaign attribution. Paid CAC and ROAS are explicitly unavailable.

## Production deployment
1. Merge the reviewed PR after tests pass. Render tracks main and may deploy automatically on merge.
2. Set server-only variables on the live Render service:
   CHATGPT_API_ORIGIN=https://digimarket-software.onrender.com
   CHATGPT_WEB_ORIGIN=https://ACTUAL-VERCEL-FRONTEND-ORIGIN
   Both require an exact HTTPS origin, no subpaths.
3. The existing Render start command applies Prisma migrations. Back up Neon first. The additive migration is 20261028090000_chatgpt_oauth.
4. Verify GET /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource, then confirm POST /api/v1/integrations/chatgpt/mcp with no bearer returns 401 and a WWW-Authenticate resource metadata header.
5. Staging smoke: founder login, OAuth PKCE, token refresh/revocation, list leads, org isolation, follow-up/meeting updates and idempotent retry. Do not send a raw production token into a conversation.
6. No new paid vendor services, production credentials or broad SQL access.

## Connecting in ChatGPT
- The portable plugin is in integrations/chatgpt-plugin.
- On ChatGPT web, open Plugins, add a custom MCP server, enter the MCP HTTPS URL above and use OAuth Dynamic Client Registration.
- The connection redirects to the Vercel consent page /chatgpt/authorize. If signed out, open the existing AmplifyWorld login in another tab and return to the consent page.
- Review scopes before granting. The default manifest requests read and write CRM scopes, not crm.contacts.read.
- Open Settings → Integrations → ChatGPT CRM in the workspace to review and revoke grants.
- APPROVED status converts leads to clients via existing CRM logic and requires an additional confirmClientConversion=true flag.

## Metrics and provenance
- Lead conversion: linked clients divided by eligible leads created in the same date window.
- Currently scheduled meeting rate: leads with a non-null current meeting date divided by eligible leads.
- CRM lead source groups are organizational labels, not campaign-level attribution.
- Meta spend, ad IDs, verified paid conversations, ad campaign CAC, ROAS, and conversion API uploads are NOT implemented by this feature; show them as missing rather than inferring data.
- Timezone for date filtering is Asia/Kolkata. Meeting appointment fields are already defined by the CRM.
- Cleared historical appointments are not reconstructed from the current schedule fields.

## Security caveats
- OAuth codes are one-use. Refresh grants are database-backed and explicitly revocable; each MCP request checks founder role and current permissions.
- Only HTTPS callbacks from verified ChatGPT/OpenAI hostnames are supported. Reassess callback hostnames before broad rollout.
- The existing primary login currently uses standard interactive session JWTs. This feature enforces enrolled MFA at consent, but does not itself rework primary login MFA.
- Token revocation on password change is not automatic. Disable an account, remove founder permissions or revoke individual grants to terminate existing ChatGPT access.
- Rate limiting is per API process, not distributed. Add a shared limiter for multi-instance production.
- CRM write idempotency is crash-safe against automatic duplicate retries but an UNCERTAIN state requires operator inspection.
- Meta WhatsApp messages must not be treated as proof of a specific paid advertisement without verified referral metadata.

## Validation commands
pnpm install --frozen-lockfile
pnpm --filter @digimarket/db db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke

Do not interpret pending or absent CI as successful.
