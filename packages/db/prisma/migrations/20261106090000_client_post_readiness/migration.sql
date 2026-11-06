-- Additive client-owned weekly post-ready stock and delivery ledger.
-- Independent of video readiness: posts never modify video inventory.
CREATE TABLE "ClientPostWeek" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "week" INTEGER NOT NULL,
  "readyAdded" INTEGER NOT NULL DEFAULT 0,
  "delivered" INTEGER NOT NULL DEFAULT 0,
  "note" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ClientPostWeek_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientPostWeek_month_valid" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "ClientPostWeek_week_valid" CHECK ("week" BETWEEN 1 AND 5),
  CONSTRAINT "ClientPostWeek_ready_nonnegative" CHECK ("readyAdded" >= 0),
  CONSTRAINT "ClientPostWeek_delivered_nonnegative" CHECK ("delivered" >= 0),
  CONSTRAINT "ClientPostWeek_version_positive" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "ClientPostWeek_clientId_month_week_key" ON "ClientPostWeek"("clientId","month","week");
CREATE INDEX "ClientPostWeek_organizationId_month_idx" ON "ClientPostWeek"("organizationId","month");
CREATE INDEX "ClientPostWeek_clientId_month_idx" ON "ClientPostWeek"("clientId","month");
ALTER TABLE "ClientPostWeek" ADD CONSTRAINT "ClientPostWeek_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPostWeek" ADD CONSTRAINT "ClientPostWeek_clientId_fkey"
 FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPostWeek" ADD CONSTRAINT "ClientPostWeek_updatedById_fkey"
 FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
