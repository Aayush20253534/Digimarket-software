-- Allow personally owned cash/clearing ledgers without labeling non-founders as founders.
-- Founder-type accounts still must have an owner.
ALTER TABLE "MoneyAccount" DROP CONSTRAINT "MoneyAccount_owner_kind";
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_owner_kind"
  CHECK ("kind" <> 'FOUNDER'::"MoneyAccountKind" OR "ownerUserId" IS NOT NULL);

-- Create unverified per-user clearing ledgers (not verified bank balances).
-- Attribute historical transactions to the authenticated original requester, not
-- enteredById, which an administrator can reassign after submission.
INSERT INTO "MoneyAccount"
 ("id","organizationId","name","normalizedName","kind","ownerUserId",
  "createdById","openingOn","openingBalance","active","createdAt")
SELECT gen_random_uuid(),u."organizationId",
       left(u."displayName" || ' - personal clearing (unverified)',120),
       'personal-clearing-' || u."id"::text,'CASH'::"MoneyAccountKind",
       u."id",u."id",DATE '2026-10-22',0,true,now()
FROM "User" u
WHERE u."status"='ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "MoneyAccount" m
    WHERE m."organizationId"=u."organizationId"
      AND m."normalizedName"='personal-clearing-' || u."id"::text
  );

-- Leave manually assigned accounts untouched. Do not modify closed cycles.
UPDATE "FinancialTransaction" f
SET "moneyAccountId"=m."id"
FROM "ApprovalRequest" r, "MoneyAccount" m
WHERE f."moneyAccountId" IS NULL
  AND r."id"=f."approvalRequestId"
  AND m."organizationId"=f."organizationId"
  AND m."ownerUserId"=r."requesterId"
  AND m."normalizedName"='personal-clearing-' || r."requesterId"::text
  AND m."openingOn"<=f."occurredOn"
  AND NOT EXISTS (
    SELECT 1 FROM "FinancePeriodClose" p
    WHERE p."organizationId"=f."organizationId"
      AND f."occurredOn" BETWEEN p."from" AND p."to"
  );
