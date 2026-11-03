CREATE TABLE "Agreement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "agreementNumber" VARCHAR(36) NOT NULL,
    "clientName" VARCHAR(160) NOT NULL,
    "agreementDate" DATE NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "serviceFee" DECIMAL(19,2) NOT NULL,
    "adBudget" DECIMAL(19,2) NOT NULL,
    "total" DECIMAL(19,2) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Agreement_date_order_check" CHECK ("endDate" >= "startDate")
);

CREATE UNIQUE INDEX "Agreement_organizationId_agreementNumber_key" ON "Agreement"("organizationId", "agreementNumber");
CREATE INDEX "Agreement_organizationId_createdAt_idx" ON "Agreement"("organizationId", "createdAt");

ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
