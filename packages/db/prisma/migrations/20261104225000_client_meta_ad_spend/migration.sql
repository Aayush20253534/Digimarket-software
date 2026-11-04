-- Track client-funded Meta advertising spend separately from agency operating expenses.
-- Existing financial entries remain agency-funded because clientId defaults to NULL.
ALTER TABLE "FinancialTransaction" ADD COLUMN "clientId" UUID;

CREATE INDEX "FinancialTransaction_organizationId_clientId_occurredOn_idx"
  ON "FinancialTransaction"("organizationId", "clientId", "occurredOn");

ALTER TABLE "FinancialTransaction"
  ADD CONSTRAINT "FinancialTransaction_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
