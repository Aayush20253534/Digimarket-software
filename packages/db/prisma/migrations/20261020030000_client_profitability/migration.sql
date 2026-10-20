-- Module 14: direct cost attribution with a parent expense CAS version.
ALTER TABLE "FinancialTransaction" ADD COLUMN "costAllocationVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "CostAllocation"(
 "expenseId" UUID NOT NULL,
 "clientId" UUID NOT NULL,
 "projectId" UUID,
 "organizationId" UUID NOT NULL,
 "amount" DECIMAL(19,4) NOT NULL,
 "note" VARCHAR(500),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "CostAllocation_pkey" PRIMARY KEY ("expenseId","clientId"),
 CONSTRAINT "CostAllocation_amount_positive" CHECK ("amount">0)
);
CREATE TABLE "RevenueRecognition"(
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "invoiceId" UUID NOT NULL,
 "clientId" UUID NOT NULL,
 "createdById" UUID NOT NULL,
 "idempotencyKey" UUID NOT NULL,
 "recognizedOn" DATE NOT NULL,
 "amount" DECIMAL(19,4) NOT NULL,
 "note" VARCHAR(500) NOT NULL,
 "reversalOfId" UUID,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RevenueRecognition_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "RevenueRecognition_valid_amount" CHECK (("amount">0 AND "reversalOfId" IS NULL) OR ("amount"<0 AND "reversalOfId" IS NOT NULL))
);
CREATE INDEX "CostAllocation_organizationId_clientId_idx" ON "CostAllocation"("organizationId","clientId");
CREATE INDEX "CostAllocation_projectId_idx" ON "CostAllocation"("projectId");
CREATE UNIQUE INDEX "RevenueRecognition_organizationId_idempotencyKey_key" ON "RevenueRecognition"("organizationId","idempotencyKey");
CREATE UNIQUE INDEX "RevenueRecognition_reversalOfId_key" ON "RevenueRecognition"("reversalOfId");
CREATE INDEX "RevenueRecognition_organizationId_clientId_recognizedOn_idx" ON "RevenueRecognition"("organizationId","clientId","recognizedOn");
CREATE INDEX "RevenueRecognition_invoiceId_recognizedOn_idx" ON "RevenueRecognition"("invoiceId","recognizedOn");
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "RevenueRecognition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "RevenueRecognition_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "RevenueRecognition_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "RevenueRecognition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "RevenueRecognition_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "RevenueRecognition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
