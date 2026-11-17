-- CreateEnum
CREATE TYPE "FinancialCategoryPurpose" AS ENUM ('GENERAL', 'META_ADS', 'SALARY');

-- CreateEnum
CREATE TYPE "MoneyAccountKind" AS ENUM ('BANK', 'CASH', 'UPI', 'FOUNDER');

-- CreateEnum
CREATE TYPE "ClientFundKind" AS ENUM ('TOPUP', 'REFUND', 'REVERSAL');

-- AlterTable
ALTER TABLE "FinancialCategory" ADD COLUMN     "purpose" "FinancialCategoryPurpose" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "moneyAccountId" UUID,
ADD COLUMN     "reversesId" UUID;

-- AlterTable
ALTER TABLE "SalaryPayment" ADD COLUMN     "reversesId" UUID;

-- AlterTable
ALTER TABLE "SalaryFundingAllocation" ADD COLUMN     "moneyAccountId" UUID;

-- CreateTable
CREATE TABLE "MoneyAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "kind" "MoneyAccountKind" NOT NULL,
    "ownerUserId" UUID,
    "createdById" UUID NOT NULL,
    "openingOn" DATE NOT NULL,
    "openingBalance" DECIMAL(19,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFundEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "moneyAccountId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "kind" "ClientFundKind" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "reference" VARCHAR(160),
    "note" VARCHAR(500) NOT NULL,
    "reversesId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFundEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyTransfer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "reversesId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyReconciliation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "moneyAccountId" UUID NOT NULL,
    "reconciledById" UUID NOT NULL,
    "asOf" DATE NOT NULL,
    "statementBalance" DECIMAL(19,4) NOT NULL,
    "expectedBalance" DECIMAL(19,4) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePeriodClose" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "closedById" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "closedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoneyAccount_organizationId_kind_idx" ON "MoneyAccount"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyAccount_organizationId_normalizedName_key" ON "MoneyAccount"("organizationId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFundEntry_reversesId_key" ON "ClientFundEntry"("reversesId");

-- CreateIndex
CREATE INDEX "ClientFundEntry_organizationId_clientId_occurredOn_idx" ON "ClientFundEntry"("organizationId", "clientId", "occurredOn");

-- CreateIndex
CREATE INDEX "ClientFundEntry_moneyAccountId_occurredOn_idx" ON "ClientFundEntry"("moneyAccountId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFundEntry_organizationId_idempotencyKey_key" ON "ClientFundEntry"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransfer_reversesId_key" ON "MoneyTransfer"("reversesId");

-- CreateIndex
CREATE INDEX "MoneyTransfer_organizationId_occurredOn_idx" ON "MoneyTransfer"("organizationId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransfer_organizationId_idempotencyKey_key" ON "MoneyTransfer"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MoneyReconciliation_organizationId_asOf_idx" ON "MoneyReconciliation"("organizationId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyReconciliation_moneyAccountId_asOf_key" ON "MoneyReconciliation"("moneyAccountId", "asOf");

-- CreateIndex
CREATE INDEX "FinancePeriodClose_organizationId_to_idx" ON "FinancePeriodClose"("organizationId", "to");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriodClose_organizationId_from_key" ON "FinancePeriodClose"("organizationId", "from");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reversesId_key" ON "FinancialTransaction"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryPayment_reversesId_key" ON "SalaryPayment"("reversesId");

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "SalaryPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryFundingAllocation" ADD CONSTRAINT "SalaryFundingAllocation_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFundEntry" ADD CONSTRAINT "ClientFundEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFundEntry" ADD CONSTRAINT "ClientFundEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFundEntry" ADD CONSTRAINT "ClientFundEntry_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFundEntry" ADD CONSTRAINT "ClientFundEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFundEntry" ADD CONSTRAINT "ClientFundEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "ClientFundEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "MoneyTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyReconciliation" ADD CONSTRAINT "MoneyReconciliation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyReconciliation" ADD CONSTRAINT "MoneyReconciliation_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyReconciliation" ADD CONSTRAINT "MoneyReconciliation_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePeriodClose" ADD CONSTRAINT "FinancePeriodClose_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePeriodClose" ADD CONSTRAINT "FinancePeriodClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve current classifications once, then use purpose instead of display names.
UPDATE "FinancialCategory" SET "purpose"='META_ADS' WHERE "kind"='EXPENSE' AND trim("name") ~* '^meta[[:space:]_-]*(ad|ads|advertising|advertisement|advertisements)$';
UPDATE "FinancialCategory" SET "purpose"='SALARY' WHERE "kind"='EXPENSE' AND lower(trim("name"))='salary';
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_amount_check";
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_amount_check" CHECK (("amount">0 AND "reversesId" IS NULL) OR ("amount"<0 AND "reversesId" IS NOT NULL));
ALTER TABLE "SalaryPayment" DROP CONSTRAINT "SalaryPayment_amount_positive";
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_amount_positive" CHECK (("amount">0 AND "reversesId" IS NULL) OR ("amount"<0 AND "reversesId" IS NOT NULL));
ALTER TABLE "SalaryFundingAllocation" DROP CONSTRAINT "SalaryFundingAllocation_amount_positive";
ALTER TABLE "SalaryFundingAllocation" ADD CONSTRAINT "SalaryFundingAllocation_amount_positive" CHECK ("amount"<>0);
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_owner_kind" CHECK (("kind"='FOUNDER')=("ownerUserId" IS NOT NULL));
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_positive_distinct" CHECK ("amount">0 AND "fromAccountId"<>"toAccountId");
ALTER TABLE "ClientFundEntry" ADD CONSTRAINT "ClientFundEntry_amount_sign" CHECK (("kind"='TOPUP' AND "amount">0 AND "reversesId" IS NULL) OR ("kind"='REFUND' AND "amount"<0 AND "reversesId" IS NULL) OR ("kind"='REVERSAL' AND "amount"<>0 AND "reversesId" IS NOT NULL));
ALTER TABLE "FinancePeriodClose" ADD CONSTRAINT "FinancePeriodClose_exact_cycle" CHECK (extract(day from "from")=22 AND "to"=("from"+interval '1 month'-interval '1 day')::date);

-- Derive cash movements from source records. No duplicated amounts or guessed accounts.
CREATE VIEW "FinanceMoneyMovement" AS
 SELECT f."id"::text AS "key",f."organizationId",f."moneyAccountId",f."occurredOn",'FINANCE'::text AS "source",f."id" AS "sourceId",CASE WHEN f."kind"='INCOME' THEN f."amount" ELSE -f."amount" END AS "amount",COALESCE(f."description",c."name") AS "description",f."createdAt",f."reversesId",(SELECT r."id" FROM "FinancialTransaction" r WHERE r."reversesId"=f."id") AS "reversedBy"
 FROM "FinancialTransaction" f JOIN "FinancialCategory" c ON c."id"=f."categoryId" WHERE f."status"='POSTED' AND f."moneyAccountId" IS NOT NULL
 UNION ALL SELECT 'salary:'||a."id"::text,p."organizationId",a."moneyAccountId",p."paidOn",'SALARY',p."id",-a."amount",'Salary: '||u."displayName",p."createdAt",p."reversesId",(SELECT r."id" FROM "SalaryPayment" r WHERE r."reversesId"=p."id") FROM "SalaryFundingAllocation" a JOIN "SalaryPayment" p ON p."id"=a."paymentId" JOIN "User" u ON u."id"=p."recipientUserId" WHERE p."status"='PAID' AND a."moneyAccountId" IS NOT NULL
 UNION ALL SELECT 'fund:'||f."id"::text,f."organizationId",f."moneyAccountId",f."occurredOn",'CLIENT_FUND',f."id",f."amount",f."kind"::text||': '||c."businessName"||' · '||f."note",f."createdAt",f."reversesId",(SELECT r."id" FROM "ClientFundEntry" r WHERE r."reversesId"=f."id") FROM "ClientFundEntry" f JOIN "Client" c ON c."id"=f."clientId"
 UNION ALL SELECT 'out:'||t."id"::text,t."organizationId",t."fromAccountId",t."occurredOn",'TRANSFER',t."id",-t."amount",t."note",t."createdAt",t."reversesId",(SELECT r."id" FROM "MoneyTransfer" r WHERE r."reversesId"=t."id") FROM "MoneyTransfer" t
 UNION ALL SELECT 'in:'||t."id"::text,t."organizationId",t."toAccountId",t."occurredOn",'TRANSFER',t."id",t."amount",t."note",t."createdAt",t."reversesId",(SELECT r."id" FROM "MoneyTransfer" r WHERE r."reversesId"=t."id") FROM "MoneyTransfer" t;

-- Every mutation shares a transaction lock with period closing. Check OLD and NEW
-- dates so moving a historical record cannot circumvent a closed cycle.
CREATE FUNCTION finance_assert_open(org uuid, day date) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text||':finance-close',0));
 IF EXISTS(SELECT 1 FROM "FinancePeriodClose" WHERE "organizationId"=org AND day BETWEEN "from" AND "to") THEN
  RAISE EXCEPTION 'FINANCE_CYCLE_CLOSED: use an adjustment in an open cycle';
 END IF;
END $$;
CREATE FUNCTION finance_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; org uuid; day date; linked boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN
  row_data=to_jsonb(OLD);
  IF TG_TABLE_NAME='SalaryFundingAllocation' THEN
   SELECT "organizationId","paidOn" INTO org,day FROM "SalaryPayment" WHERE "id"=(row_data->>'paymentId')::uuid;
  ELSE org=(row_data->>'organizationId')::uuid;day=(row_data->>TG_ARGV[0])::date; END IF;
  PERFORM finance_assert_open(org,day);
  IF TG_TABLE_NAME IN ('FinancialTransaction','SalaryPayment','ClientFundEntry','MoneyTransfer') THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "reversesId"=$1)',TG_TABLE_NAME) INTO linked USING (row_data->>'id')::uuid;
   IF row_data->>'reversesId' IS NOT NULL OR linked THEN RAISE EXCEPTION 'FINANCE_REVERSED: reversed records are immutable'; END IF;
  ELSIF TG_TABLE_NAME='SalaryFundingAllocation' THEN
   IF EXISTS(SELECT 1 FROM "SalaryPayment" p WHERE (p."id"=(row_data->>'paymentId')::uuid AND p."reversesId" IS NOT NULL) OR p."reversesId"=(row_data->>'paymentId')::uuid) THEN RAISE EXCEPTION 'FINANCE_REVERSED: reversed salary allocations are immutable'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  row_data=to_jsonb(NEW);
  IF TG_TABLE_NAME='SalaryFundingAllocation' THEN
   SELECT "organizationId","paidOn" INTO org,day FROM "SalaryPayment" WHERE "id"=(row_data->>'paymentId')::uuid;
  ELSE org=(row_data->>'organizationId')::uuid;day=(row_data->>TG_ARGV[0])::date; END IF;
  PERFORM finance_assert_open(org,day);
  IF TG_TABLE_NAME='SalaryFundingAllocation' AND NOT EXISTS(SELECT 1 FROM "SalaryPayment" p WHERE p."id"=(row_data->>'paymentId')::uuid AND sign(p."amount")=sign((row_data->>'amount')::numeric)) THEN
   RAISE EXCEPTION 'FINANCE_ACCOUNT_SCOPE: salary allocation sign must match its payment';
  END IF;
  IF row_data->>'moneyAccountId' IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "MoneyAccount" WHERE "id"=(row_data->>'moneyAccountId')::uuid AND "organizationId"=org AND "openingOn"<=day) THEN RAISE EXCEPTION 'FINANCE_ACCOUNT_SCOPE: account organization or opening date mismatch'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER finance_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "FinancialTransaction" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('occurredOn');
CREATE TRIGGER salary_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "SalaryPayment" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('paidOn');
CREATE TRIGGER salary_allocation_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "SalaryFundingAllocation" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('paidOn');
CREATE TRIGGER client_fund_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "ClientFundEntry" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('occurredOn');
CREATE TRIGGER transfer_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "MoneyTransfer" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('occurredOn');
CREATE TRIGGER settlement_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "InternalSettlement" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('occurredOn');
CREATE TRIGGER account_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "MoneyAccount" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('openingOn');
CREATE TRIGGER reconciliation_period_guard BEFORE INSERT OR UPDATE OR DELETE ON "MoneyReconciliation" FOR EACH ROW EXECUTE FUNCTION finance_closed_guard('asOf');

-- A close is an immutable snapshot; corrections belong to a subsequent cycle.
CREATE FUNCTION finance_close_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'FINANCE_CYCLE_CLOSED: a closing snapshot cannot be changed'; END $$;
CREATE TRIGGER closing_snapshot_guard BEFORE UPDATE OR DELETE ON "FinancePeriodClose" FOR EACH ROW EXECUTE FUNCTION finance_close_immutable();
