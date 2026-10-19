CREATE TYPE "FinanceKind" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "FinanceStatus" AS ENUM ('PENDING', 'POSTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "FinanceMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER');
CREATE TABLE "FinancialCategory" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "kind" "FinanceKind" NOT NULL,
 "name" VARCHAR(120) NOT NULL,
 "normalizedName" VARCHAR(120) NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FinancialTransaction" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "enteredById" UUID NOT NULL,
 "categoryId" UUID NOT NULL,
 "approvalRequestId" UUID NOT NULL,
 "idempotencyKey" UUID NOT NULL,
 "kind" "FinanceKind" NOT NULL,
 "amount" DECIMAL(19,4) NOT NULL,
 "currencyCode" VARCHAR(3) NOT NULL,
 "occurredOn" DATE NOT NULL,
 "merchantOrSource" VARCHAR(160),
 "method" "FinanceMethod" NOT NULL,
 "description" VARCHAR(2000),
 "status" "FinanceStatus" NOT NULL DEFAULT 'PENDING',
 "postedAt" TIMESTAMPTZ(6),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FinancialTransaction_amount_check" CHECK ("amount" > 0),
 CONSTRAINT "FinancialTransaction_status_postedAt_check" CHECK (("status" = 'POSTED') = ("postedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "FinancialCategory_organizationId_kind_normalizedName_key" ON "FinancialCategory"("organizationId","kind","normalizedName");
CREATE INDEX "FinancialCategory_organizationId_kind_active_idx" ON "FinancialCategory"("organizationId","kind","active");
CREATE UNIQUE INDEX "FinancialTransaction_approvalRequestId_key" ON "FinancialTransaction"("approvalRequestId");
CREATE UNIQUE INDEX "FinancialTransaction_organizationId_idempotencyKey_key" ON "FinancialTransaction"("organizationId","idempotencyKey");
CREATE INDEX "FinancialTransaction_organizationId_status_kind_occurredOn_idx" ON "FinancialTransaction"("organizationId","status","kind","occurredOn");
CREATE INDEX "FinancialTransaction_organizationId_enteredById_createdAt_idx" ON "FinancialTransaction"("organizationId","enteredById","createdAt");
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
