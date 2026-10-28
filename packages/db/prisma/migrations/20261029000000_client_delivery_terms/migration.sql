-- Agreement terms and recurring service targets are attached to existing clients.
ALTER TABLE "Client"
  ADD COLUMN "contractStartOn" DATE,
  ADD COLUMN "contractEndOn" DATE,
  ADD COLUMN "monthlyFee" DECIMAL(19,4),
  ADD COLUMN "monthlyAdBudget" DECIMAL(19,4);

ALTER TABLE "ClientService"
  ADD COLUMN "monthlyTarget" INTEGER;

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_contract_dates_valid" CHECK ("contractStartOn" IS NULL OR "contractEndOn" IS NULL OR "contractStartOn" <= "contractEndOn");
ALTER TABLE "ClientService"
  ADD CONSTRAINT "ClientService_monthly_target_valid" CHECK ("monthlyTarget" IS NULL OR ("monthlyTarget" >= 1 AND "monthlyTarget" <= 1000));
