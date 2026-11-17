# Category management and agreement expiry

Finance → Categories now opens two cards: Income categories and Expense categories. Each opens its own management page and fixes the new-category type to that page. Existing categories and transaction references are retained.

Clients → client workspace → Agreement → End agreement early records an actual end date and reason, increments the client version, and writes an audit event. It requires the existing clients.read and clients.edit permissions. The date must be on or after the agreement start, on or before its original end (if set), and no later than today in Asia/Kolkata. Concurrent or stale changes are rejected.

Ending sets the client to EXPIRED and records agreementEndedOn/agreementEndReason. Original agreement dates and rates, received income, invoices, contacts and delivery records remain intact. Ended clients leave the current directory and active delivery overview, appear under Clients → Expired, and no longer contribute service fees or ad budgets to Finance agreement projections. Their workspaces remain accessible. Existing profile edits cannot reactivate an explicitly ended agreement.

Unarchived agreements also appear in Expired after their scheduled end date and are excluded from projections without a scheduled database update. The scheduled last day remains inclusive. Open-ended agreements remain current. Archived clients retain their existing archive classification. Projections reflect active, unexpired agreements overlapping the selected work cycle; posted financial records remain separate.

Deploy migration `20261117170000_client_agreement_expiry` before the updated API and web. It adds the EXPIRED enum value and two nullable fields; it does not end any client agreement or rewrite transaction history. The existing Render startup applies migrations.

Validation covers migration/schema consistency, separate category creation and navigation, early/natural expiry, current/expired pagination, date validation, concurrent ending, audit and access checks, projection removal, preserved posted income, browser confirmation/cancellation and mobile layout.
