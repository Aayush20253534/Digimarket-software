CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT','ISSUED','VOID');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','VERIFIED','REJECTED');
CREATE TYPE "BillingFrequency" AS ENUM ('MONTHLY','QUARTERLY','YEARLY');
CREATE TABLE "InvoiceCounter" ("organizationId" UUID NOT NULL, "nextNumber" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("organizationId"));
CREATE TABLE "BillingSchedule" (
 "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "clientId" UUID NOT NULL, "createdById" UUID NOT NULL,
 "sellerName" VARCHAR(180) NOT NULL, "sellerAddress" VARCHAR(500) NOT NULL,
 "sellerTaxId" VARCHAR(40), "buyerName" VARCHAR(180) NOT NULL, "buyerAddress" VARCHAR(500),
 "notes" VARCHAR(2000),"lines" JSONB NOT NULL, "frequency" "BillingFrequency" NOT NULL,
 "anchorAt" TIMESTAMPTZ(6) NOT NULL,"nextRunAt" TIMESTAMPTZ(6) NOT NULL,"dueAfterDays" INTEGER NOT NULL DEFAULT 14,
 "enabled" BOOLEAN NOT NULL DEFAULT true,"version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "BillingSchedule_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Invoice" (
 "id" UUID NOT NULL,"organizationId" UUID NOT NULL,"clientId" UUID NOT NULL,
 "createdById" UUID NOT NULL,"issuedById" UUID,"scheduleId" UUID,"scheduledFor" TIMESTAMPTZ(6),
 "number" VARCHAR(40),"status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
 "sellerName" VARCHAR(180) NOT NULL,"sellerAddress" VARCHAR(500) NOT NULL,"sellerTaxId" VARCHAR(40),
 "buyerName" VARCHAR(180) NOT NULL,"buyerAddress" VARCHAR(500),
 "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'INR',"issuedOn" DATE,"dueOn" DATE NOT NULL,
 "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,"taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
 "total" DECIMAL(19,4) NOT NULL DEFAULT 0,"paidTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
 "notes" VARCHAR(2000),"version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"));
CREATE TABLE "InvoiceLine" (
 "id" UUID NOT NULL,"invoiceId" UUID NOT NULL,"position" INTEGER NOT NULL,
 "description" VARCHAR(500) NOT NULL,"quantity" DECIMAL(12,2) NOT NULL,
 "unitPrice" DECIMAL(19,4) NOT NULL,"taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
 "net" DECIMAL(19,4) NOT NULL,"tax" DECIMAL(19,4) NOT NULL,
 "total" DECIMAL(19,4) NOT NULL,CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Payment" (
 "id" UUID NOT NULL,"organizationId" UUID NOT NULL,"clientId" UUID NOT NULL,
 "recordedById" UUID NOT NULL,"verifiedById" UUID,"ledgerEntryId" UUID,
 "categoryId" UUID NOT NULL,"idempotencyKey" UUID NOT NULL,
 "amount" DECIMAL(19,4) NOT NULL,"currencyCode" VARCHAR(3) NOT NULL DEFAULT 'INR',
 "receivedOn" DATE NOT NULL,"method" "FinanceMethod" NOT NULL,"reference" VARCHAR(180) NOT NULL,
 "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',"verifiedAt" TIMESTAMPTZ(6),
 "version" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PaymentAllocation" (
 "paymentId" UUID NOT NULL,"invoiceId" UUID NOT NULL,
 "amount" DECIMAL(19,4) NOT NULL,
 CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("paymentId","invoiceId"));
CREATE UNIQUE INDEX "Invoice_organizationId_number_key" ON "Invoice"("organizationId","number");
CREATE UNIQUE INDEX "Invoice_scheduleId_scheduledFor_key" ON "Invoice"("scheduleId","scheduledFor");
CREATE INDEX "Invoice_organizationId_status_dueOn_idx" ON "Invoice"("organizationId","status","dueOn");
CREATE INDEX "Invoice_organizationId_clientId_createdAt_idx" ON "Invoice"("organizationId","clientId","createdAt");
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId","position");
CREATE UNIQUE INDEX "Payment_ledgerEntryId_key" ON "Payment"("ledgerEntryId");
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId","idempotencyKey");
CREATE UNIQUE INDEX "Payment_organizationId_method_reference_key" ON "Payment"("organizationId","method","reference");
CREATE INDEX "Payment_organizationId_status_createdAt_idx" ON "Payment"("organizationId","status","createdAt");
CREATE INDEX "Payment_organizationId_clientId_receivedOn_idx" ON "Payment"("organizationId","clientId","receivedOn");
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE INDEX "BillingSchedule_enabled_nextRunAt_idx" ON "BillingSchedule"("enabled","nextRunAt");
CREATE INDEX "BillingSchedule_organizationId_clientId_idx" ON "BillingSchedule"("organizationId","clientId");
ALTER TABLE "InvoiceCounter" ADD CONSTRAINT "InvoiceCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BillingSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amount_guard" CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "total" > 0 AND "paidTotal" >= 0 AND "paidTotal" <= "total");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_guard" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_guard" CHECK ("amount" > 0);
