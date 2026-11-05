# DigiMarket AI Review Cards

## Customer flow
- Founders/staff with `clients.read` can inspect cards; `clients.edit` can create/edit/pause them.
- Create one card for an existing CRM client, entering the exact Google Business Profile “Ask for reviews” link.
- A unique opaque slug and QR code point to `/review/<slug>`. Print the card from the dashboard.
- On scanning, the public page automatically requests a newly drafted review. No customer Generate button is required.
- Each draft is editable. Placeholder text must be replaced with the customer's genuine experience.
- The customer chooses whether to copy and open the official Google review page. DigiMarket cannot post reviews on their behalf.

## Backend and deployment
1. Deploy the additive migration at `packages/db/prisma/migrations/20261105170000_ai_review_cards/migration.sql` with `pnpm --filter @digimarket/db db:migrate:deploy`.
2. Build and deploy the backend and frontend at the same revision. Deploy backend first if independent.
3. On the Render API service configure `GROQ_API_KEY` (server-side only) and optionally `GROQ_REVIEW_MODEL` (default `openai/gpt-oss-20b`). Obtain the key from https://console.groq.com/keys. The Groq API uses `https://api.groq.com/openai/v1/chat/completions`. If `GROQ_API_KEY` is absent, the previous `OPENAI_API_KEY` / `OPENAI_REVIEW_MODEL` integration remains available.
4. Without a valid API key, on provider quota exhaustion (HTTP 429), provider failure or timeout, the system intentionally returns a labeled non-AI starter draft, rather than silently charging a secondary provider. Never disclose the API key to the browser.
5. Test in `/app/ai-review-cards`, create a card, scan its QR with a mobile phone, verify a new draft appears automatically, edit the bracketed personal detail, and test the official Google link.

## Data, privacy, metrics
- `ReviewCard` is organization-scoped and linked to one existing client.
- `ReviewCardEvent` stores only `SCAN`, `GENERATED` and `CLICK` events with timestamps, no customer identity, clipboard content, or review contents.
- Counts represent landing-page draft requests and outbound clicks, **not** verified published reviews or guaranteed local SEO gains.
- Public endpoints are rate-limited. Cards can be paused from the dashboard. QR links do not change after editing.
- QR artwork currently uses the public `api.qrserver.com` image endpoint and therefore depends on that provider for rendering. A local QR renderer would require adding and locking a dependency.
- The default AI prompt disallows invented customer experiences, fake praise, star ratings, incentives, and posting automation.
