-- Additive salary/founder funding ledger; existing finance rows remain untouched.
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('PAID','VOID');

CREATE TABLE "SalaryFundingAccount" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "founderUserId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "normalizedName" VARCHAR(100) NOT NULL,
  "openingBalance" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "availableBalance" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "SalaryFundingAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryFundingAccount_opening_nonnegative" CHECK ("openingBalance">=0),
  CONSTRAINT "SalaryFundingAccount_available_nonnegative" CHECK ("availableBalance">=0)
);
CREATE UNIQUE INDEX "SalaryFundingAccount_organizationId_founderUserId_normalize_key"
  ON "SalaryFundingAccount" ("organizationId","founderUserId","normalizedName");
CREATE INDEX "SalaryFundingAccount_organizationId_founderUserId_idx"
  ON "SalaryFundingAccount" ("organizationId","founderUserId");
ALTER TABLE "SalaryFundingAccount" ADD CONSTRAINT "SalaryFundingAccount_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryFundingAccount" ADD CONSTRAINT "SalaryFundingAccount_founderUserId_fkey"
 FOREIGN KEY ("founderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryFundingAccount" ADD CONSTRAINT "SalaryFundingAccount_createdById_fkey"
 FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SalaryFundingCredit" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "recordedById" UUID NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "recordedOn" DATE NOT NULL,
  "description" VARCHAR(250),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryFundingCredit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryFundingCredit_positive_amount" CHECK ("amount">0)
);
CREATE INDEX "SalaryFundingCredit_organizationId_recordedOn_idx"
 ON "SalaryFundingCredit" ("organizationId","recordedOn");
CREATE INDEX "SalaryFundingCredit_accountId_createdAt_idx"
 ON "SalaryFundingCredit" ("accountId","createdAt");
ALTER TABLE "SalaryFundingCredit" ADD CONSTRAINT "SalaryFundingCredit_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryFundingCredit" ADD CONSTRAINT "SalaryFundingCredit_accountId_fkey"
 FOREIGN KEY ("accountId") REFERENCES "SalaryFundingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryFundingCredit" ADD CONSTRAINT "SalaryFundingCredit_recordedById_fkey"
 FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SalaryPayment" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "salaryMonth" VARCHAR(7) NOT NULL,
  "paidOn" DATE NOT NULL,
  "method" "FinanceMethod" NOT NULL,
  "reference" VARCHAR(160),
  "note" VARCHAR(500),
  "status" "SalaryPaymentStatus" NOT NULL DEFAULT 'PAID',
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  "voidReason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryPayment_amount_positive" CHECK ("amount">0),
  CONSTRAINT "SalaryPayment_month_format" CHECK ("salaryMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX "SalaryPayment_organizationId_idempotencyKey_key"
 ON "SalaryPayment" ("organizationId","idempotencyKey");
CREATE INDEX "SalaryPayment_organizationId_status_paidOn_idx"
 ON "SalaryPayment" ("organizationId","status","paidOn");
CREATE INDEX "SalaryPayment_organizationId_recipientUserId_paidOn_idx"
 ON "SalaryPayment" ("organizationId","recipientUserId","paidOn");
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_recipientUserId_fkey"
 FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_createdById_fkey"
 FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_voidedById_fkey"
 FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SalaryFundingAllocation" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  CONSTRAINT "SalaryFundingAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryFundingAllocation_amount_positive" CHECK ("amount">0)
);
CREATE UNIQUE INDEX "SalaryFundingAllocation_paymentId_accountId_key"
 ON "SalaryFundingAllocation" ("paymentId","accountId");
CREATE INDEX "SalaryFundingAllocation_accountId_idx"
 ON "SalaryFundingAllocation" ("accountId");
ALTER TABLE "SalaryFundingAllocation" ADD CONSTRAINT "SalaryFundingAllocation_paymentId_fkey"
 FOREIGN KEY ("paymentId") REFERENCES "SalaryPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryFundingAllocation" ADD CONSTRAINT "SalaryFundingAllocation_accountId_fkey"
 FOREIGN KEY ("accountId") REFERENCES "SalaryFundingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
