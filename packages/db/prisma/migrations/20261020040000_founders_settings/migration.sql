-- Module 15: optimistic versions and persistent billing defaults, with no permission implications.
ALTER TABLE "Organization" ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "FounderProfile" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "FounderProfile" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "OrganizationBillingSettings" (
 "organizationId" UUID NOT NULL,
 "invoicePrefix" VARCHAR(12) NOT NULL DEFAULT 'INV',
 "defaultDueDays" INTEGER NOT NULL DEFAULT 14,
 "paymentInstructions" VARCHAR(1000),
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "OrganizationBillingSettings_pkey" PRIMARY KEY ("organizationId"),
 CONSTRAINT "OrganizationBillingSettings_defaultDueDays_check" CHECK ("defaultDueDays" BETWEEN 0 AND 365),
 CONSTRAINT "OrganizationBillingSettings_invoicePrefix_check" CHECK ("invoicePrefix" ~ '^[A-Z][A-Z0-9]{1,11}$')
);
ALTER TABLE "OrganizationBillingSettings" ADD CONSTRAINT "OrganizationBillingSettings_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
