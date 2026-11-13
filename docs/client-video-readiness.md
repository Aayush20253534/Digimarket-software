# Client video readiness (weekly stock)

## Access

Open **Clients → Video readiness** and select a client, or open a client's workspace and choose the **Video readiness** tab.

Requires `clients.read` to view, `clients.edit` to update. Counts are scoped by the current organization and client. The module does not grant additional visibility to private assets.

## Month and week

Choose a month in YYYY-MM. Weekly periods are consecutive seven-day blocks from the client's **Contract start** field, regardless of calendar-month boundaries. Each week is displayed once, under the month in which it begins. A configured **Contract end** caps the last week inclusively, and no new week begins after it. For example, a contract from 13 November through 12 December 2026 displays 13–19 Nov, 20–26 Nov, 27 Nov–3 Dec in November, followed by 4–10 Dec and 11–12 Dec in December.

 If the client has no Contract start date saved, the previous calendar-month 1–7, 8–14, 15–21, 22–28 and 29–month-end weeks remain available. Contract dates come from the client's profile; documents in the Agreements module are not linked to a client by their name. Changing contract dates does not delete or automatically redistribute historical saved week movements.

For each client/week manually enter:

- **New videos ready:** newly completed/approved videos entering ready stock that week, counted **once**.
- **Videos delivered:** videos handed over to the client or published as completed deliverables and leaving the ready stock.
- **Notes:** optional production/delivery context.

**Stock after each week = opening stock + newly ready − delivered.** Closing stock automatically carries forward into the next month. Available stock is ready for upcoming posting or delivery. This is not the count of raw videos, unfinished edits or queued but unapproved clips.

The selected month displays opening carried stock, newly ready this month, delivered this month, final ready stock and running stock by week. Historical month edits revalidate every subsequent week to prevent negative future stock.

## Data integrity

- One row per client, month, week; the account stores weekly movements rather than repeated stock snapshots.
- Counts are non-negative integers up to 10,000, validated server-side.
- Deliveries may not exceed available ready stock, including after a backdated revision.
- Concurrent edits use optimistic versions and serializable PostgreSQL transactions. Conflicts require a reload, rather than overwriting someone else's changes.
- Every save writes an audit entry with editor, client and previous/current counts.
- Read and write operations require both the correct permission and a client in the user's organization. Cross-workspace requests return 404.
- **This is an independent, manually maintained production tracker**, not a claim to automatically count video files, read project deliverables or infer social media posting. The distinct definitions prevent counting a prepared video several times as it remains in stock.

## Deployment

The additive Prisma migration `20261105201000_client_video_readiness` must be applied to the existing PostgreSQL database before the updated API serves these routes. No existing client, delivery, content or finance rows are reset or modified. The existing production startup migration workflow handles deployment. No new API keys or environment variables are necessary.

CI extends the isolated-PostgreSQL Clients test to cover stock rollover, February weeks, optimistic concurrency, negative-stock validation, tenant isolation and audit history.
