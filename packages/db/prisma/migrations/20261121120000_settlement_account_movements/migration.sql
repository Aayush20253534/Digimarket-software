-- Active founder settlements move money between the sender and recipient clearing accounts.
-- Each contributes equal and opposite movements, so company income and expenses are unaffected.
-- Existing settlements are projected automatically without editing source records.
CREATE OR REPLACE VIEW "FinanceMoneyMovement" AS
 SELECT f."id"::text AS "key",f."organizationId",f."moneyAccountId",f."occurredOn",'FINANCE'::text AS "source",f."id" AS "sourceId",CASE WHEN f."kind"='INCOME' THEN f."amount" ELSE -f."amount" END AS "amount",COALESCE(f."description",c."name") AS "description",f."createdAt",f."reversesId",(SELECT r."id" FROM "FinancialTransaction" r WHERE r."reversesId"=f."id") AS "reversedBy"
 FROM "FinancialTransaction" f JOIN "FinancialCategory" c ON c."id"=f."categoryId" WHERE f."status"='POSTED' AND f."moneyAccountId" IS NOT NULL
 UNION ALL SELECT 'salary:'||a."id"::text,p."organizationId",a."moneyAccountId",p."paidOn",'SALARY',p."id",-a."amount",'Salary: '||u."displayName",p."createdAt",p."reversesId",(SELECT r."id" FROM "SalaryPayment" r WHERE r."reversesId"=p."id") FROM "SalaryFundingAllocation" a JOIN "SalaryPayment" p ON p."id"=a."paymentId" JOIN "User" u ON u."id"=p."recipientUserId" WHERE p."status"='PAID' AND a."moneyAccountId" IS NOT NULL
 UNION ALL SELECT 'fund:'||f."id"::text,f."organizationId",f."moneyAccountId",f."occurredOn",'CLIENT_FUND',f."id",f."amount",f."kind"::text||': '||c."businessName"||' · '||f."note",f."createdAt",f."reversesId",(SELECT r."id" FROM "ClientFundEntry" r WHERE r."reversesId"=f."id") FROM "ClientFundEntry" f JOIN "Client" c ON c."id"=f."clientId"
 UNION ALL SELECT 'out:'||t."id"::text,t."organizationId",t."fromAccountId",t."occurredOn",'TRANSFER',t."id",-t."amount",t."note",t."createdAt",t."reversesId",(SELECT r."id" FROM "MoneyTransfer" r WHERE r."reversesId"=t."id") FROM "MoneyTransfer" t
 UNION ALL SELECT 'in:'||t."id"::text,t."organizationId",t."toAccountId",t."occurredOn",'TRANSFER',t."id",t."amount",t."note",t."createdAt",t."reversesId",(SELECT r."id" FROM "MoneyTransfer" r WHERE r."reversesId"=t."id") FROM "MoneyTransfer" t
UNION ALL SELECT 'settlement-out:'||s."id"::text,s."organizationId",a."id",s."occurredOn",'SETTLEMENT',s."id",-s."amount",
 'Internal settlement to '||other."displayName"||COALESCE(' · '||NULLIF(s."note",''),''),s."createdAt",NULL::uuid,NULL::uuid
 FROM "InternalSettlement" s JOIN "MoneyAccount" a ON a."organizationId"=s."organizationId"
 AND a."ownerUserId"=s."senderId" AND a."normalizedName"='personal-clearing-'||s."senderId"::text
 JOIN "User" other ON other."id"=s."recipientId" WHERE s."voidedAt" IS NULL
UNION ALL SELECT 'settlement-in:'||s."id"::text,s."organizationId",a."id",s."occurredOn",'SETTLEMENT',s."id",s."amount",
 'Internal settlement from '||other."displayName"||COALESCE(' · '||NULLIF(s."note",''),''),s."createdAt",NULL::uuid,NULL::uuid
 FROM "InternalSettlement" s JOIN "MoneyAccount" a ON a."organizationId"=s."organizationId"
 AND a."ownerUserId"=s."recipientId" AND a."normalizedName"='personal-clearing-'||s."recipientId"::text
 JOIN "User" other ON other."id"=s."senderId" WHERE s."voidedAt" IS NULL;
