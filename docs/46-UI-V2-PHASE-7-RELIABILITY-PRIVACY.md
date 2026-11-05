# DigiMarket UI v2 — Phase 7: Reliability and Privacy Hardening

## Status and scope

The approved six-phase design system ended with Phase 6. Phase 7 is an incremental production-hardening extension requested after that release. It focuses on protecting private workspace state from asynchronous race conditions while retaining every existing module, API, database schema, access rule and client workflow.

No migration, endpoint or permission changes. No accounting, documents/PDF, lead, task, delivery or approval state changes.

## Personal Search: newest request wins

- Each submitted search receives a monotonically increasing request identifier. Only the most recently submitted response can update the displayed results, loading state or error.
- The active authenticated user ID is checked before applying an asynchronous response.
- Signing into a different account invalidates requests that started under the previous account and clears the previous query, results and error state.
- The latest query is visible in the result heading. Pending requests show a neutral progress message, not a false “No matching records” empty state.
- API errors display the actual error notification and cannot be confused with an empty successful search.
- The existing `search.read` permission and server-side scope remain authoritative. No new search endpoint or result query semantics were introduced.
- Repeated searches are allowed; older responses are ignored without cancelling or mutating server data.

## Direct Messages: recipient and account isolation

- Members polling uses a monotonically increasing request ID and authenticated owner. An older poll cannot overwrite a newer member list or expose data to a different signed-in user.
- On account switch, the selected conversation, messages, draft and attachment are cleared.
- Thread fetching and read acknowledgment update the UI only while both recipient and account still match their original request context.
- A pending FileReader is aborted/invalidated when the user changes recipient. Late load/error callbacks cannot attach a file to the wrong person's conversation.
- The composer shows **Preparing attachment…** while file encoding is in progress. Sending is blocked until the attachment is ready, avoiding accidental text-only sends when the user intended a file.
- If a send to one recipient completes after another recipient was selected, it cannot clear that other recipient's draft or attachment.
- In the Unread filter, the currently open conversation remains visible after its messages are marked read so the active context does not disappear unexpectedly.
- Existing messages, attachments, user privacy enforcement, polling intervals, API permissions, max file size, downloads and read receipts are unchanged.

## Validation

The authenticated browser suite now includes:
1. An employee-scoped personal Search test where an old API response is deliberately delayed until after a new response. The new result must remain visible.
2. A founder-scoped messaging test with a delayed FileReader. Leaving and reopening the conversation must remove the pending attachment and leave Send disabled; the same guard also protects switching to another recipient.
3. Existing full regression coverage of Finance, Reports, Quotations/Agreements, Leads, Client Deliveries, Tasks, Approvals, Settings, Messages and responsive dark/light UI.

The Phase 7 stylesheet `aw-phase7-reliability.css` uses the inherited monochrome tokens and reduced-motion rules for search and attachment progress.

## Release gate

Require all configured GitHub checks, including build, types, lint, isolated browser integration and screenshots. Merge only after pass. Verify the exact merged commit's Vercel deployment separately. A build-rate-limit response, green preview, or unrelated earlier production SHA is not proof that Phase 7 is live.
