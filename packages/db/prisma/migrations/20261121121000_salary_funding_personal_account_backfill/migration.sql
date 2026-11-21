-- Restore legacy salary spending attribution without changing amounts or payment dates.
-- Previously 4 allocations worth INR 15,000 were missing an owner money-account link.
-- Match only the salary funder's exact organization-scoped personal clearing account;
-- leave unmatched records unassigned for explicit reconciliation.
UPDATE "SalaryFundingAllocation" a
SET "moneyAccountId" = m."id"
FROM "SalaryFundingAccount" s
JOIN "MoneyAccount" m
  ON m."organizationId"=s."organizationId"
 AND m."ownerUserId"=s."founderUserId"
 AND m."normalizedName"='personal-clearing-'||s."founderUserId"::text
WHERE a."accountId"=s."id"
  AND a."moneyAccountId" IS NULL;
