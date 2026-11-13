# Client Post Readiness

Post Readiness is a **separate** weekly inventory ledger in DigiMarket Clients, parallel to Video Readiness. It contains **Regular posts** and **Festival posts** as independently tracked categories. Neither category affects Video Readiness, and festival movements do not change regular-post inventory.

## Workflow

Open **Clients → Post readiness**, select the client and month, or open an individual client's **Post readiness** tab. Select **Regular posts** or **Festival posts**:

- **New posts ready**: completed, approved static designs ready for future posting or delivery, added to the selected stock category once.
- **Posts delivered**: designs handed over to the client or published, leaving the selected category's stock.
- **Notes**: optional production and delivery context. In the Festival posts tab, write the festival name(s) and deadlines (e.g. Diwali, Holi).

Each category's stock after week = its opening stock + its new posts ready − its delivered posts. Festival posts do not automatically count as regular posts or offset missing regular-post inventory. Switching categories preserves unsaved edits until the next refresh or save.

Weeks begin on the client's **Contract start** date and continue as consecutive seven-day periods, even across month boundaries. Each period is shown in the month when it starts, and the final period ends on **Contract end**, inclusive. For example, 13 November–12 December 2026 shows 13–19, 20–26 and 27 Nov–3 Dec in November, then 4–10 and 11–12 Dec in December.

 Clients without a Contract start date in their client profile keep the previous 1–7, 8–14, 15–21, 22–28 and 29–month-end buckets until one is configured. Contract dates are not inferred from unlinked Agreements documents by matching business names. Existing saved movements are preserved when contract dates change and may require reconciliation if recorded using the old schedule. Unused posts carry into the next week/month within their category. Backdated corrections are checked against subsequent saved weeks to prevent negative stock.

## Controls

Existing **clients.read** permission allows viewing. **clients.edit** permits saving counts. Clients are organization-scoped. Saves use an optimistic version, serializable database transaction, a unique client/month/week record, and the existing audit log. Each count must be a nonnegative integer at most 10,000. A weekly save updates both categories atomically. Older API clients that do not send festival fields retain existing festival values. Post Readiness has no dependency on Video Readiness stock.

The tracker is manually maintained; it does **not** automatically count Instagram posts, designs, scheduled publications, media assets, or uploaded files.

## Deploy

Deploy the frontend and the matching backend from the merged `main` commit. Apply the original `20261106090000_client_post_readiness` migration (if pending), followed by the additive `20261109223500_festival_post_readiness` migration to the existing Postgres database **before** deploying the matching API/frontend. Existing post rows get zero festival counts, without resetting other data. Do not reset existing data. No additional API keys are required.

Routes:
- `GET /api/v1/clients/:id/post-readiness?month=YYYY-MM`
- `PUT /api/v1/clients/:id/post-readiness/:week` with `{month,readyAdded,delivered,note,festivalReadyAdded,festivalDelivered,festivalNote,version}`. Festival fields are optional for legacy consumers; omitted fields preserve their saved values.

Both routes are explicitly permitted by the Next.js API proxy, and the read route forwards the `month` query parameter.
