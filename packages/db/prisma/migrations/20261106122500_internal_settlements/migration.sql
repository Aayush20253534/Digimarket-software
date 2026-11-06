-- Internal settlements are informational founder-to-founder records.
-- No FinancialTransaction, company account, or salary funding rows are inserted.
CREATE TABLE "InternalSettlement" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "occurredOn" DATE NOT NULL,
  "method" "FinanceMethod" NOT NULL,
  "note" VARCHAR(500),
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  "voidReason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InternalSettlement_positive_amount" CHECK ("amount" > 0),
  CONSTRAINT "InternalSettlement_distinct_founders" CHECK ("senderId" <> "recipientId")
);
CREATE UNIQUE INDEX "InternalSettlement_organizationId_idempotencyKey_key"
  ON "InternalSettlement"("organizationId","idempotencyKey");
CREATE INDEX "InternalSettlement_organizationId_senderId_createdAt_idx"
  ON "InternalSettlement"("organizationId","senderId","createdAt");
CREATE INDEX "InternalSettlement_organizationId_recipientId_createdAt_idx"
  ON "InternalSettlement"("organizationId","recipientId","createdAt");
ALTER TABLE "InternalSettlement" ADD CONSTRAINT "InternalSettlement_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalSettlement" ADD CONSTRAINT "InternalSettlement_senderId_fkey"
 FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalSettlement" ADD CONSTRAINT "InternalSettlement_recipientId_fkey"
 FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalSettlement" ADD CONSTRAINT "InternalSettlement_voidedById_fkey"
 FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
