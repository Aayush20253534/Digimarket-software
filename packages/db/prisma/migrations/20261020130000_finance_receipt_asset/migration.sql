ALTER TABLE "FinancialTransaction" ADD COLUMN "receiptAssetId" UUID;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_receiptAssetId_fkey"
 FOREIGN KEY("receiptAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FinancialTransaction_organizationId_receiptAssetId_idx"
 ON "FinancialTransaction"("organizationId","receiptAssetId");
