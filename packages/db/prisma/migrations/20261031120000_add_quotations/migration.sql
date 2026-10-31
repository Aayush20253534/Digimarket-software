-- Immutable quotation snapshots and organization-scoped quote numbers.
CREATE TABLE "Quotation" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "quoteNumber" VARCHAR(36) NOT NULL,
  "clientName" VARCHAR(160) NOT NULL,
  "quoteDate" DATE NOT NULL,
  "serviceFee" DECIMAL(19,2) NOT NULL,
  "adBudget" DECIMAL(19,2) NOT NULL,
  "taxAmount" DECIMAL(19,2) NOT NULL,
  "total" DECIMAL(19,2) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Quotation_organizationId_quoteNumber_key"
  ON "Quotation"("organizationId", "quoteNumber");
CREATE INDEX "Quotation_organizationId_createdAt_idx"
  ON "Quotation"("organizationId", "createdAt");
ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_organizationId_fkey" FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
