-- Additive month/week stock-movement ledger for client video readiness.
CREATE TABLE "ClientVideoWeek" (
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
  CONSTRAINT "ClientVideoWeek_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientVideoWeek_month_valid" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "ClientVideoWeek_week_valid" CHECK ("week" BETWEEN 1 AND 5),
  CONSTRAINT "ClientVideoWeek_ready_nonnegative" CHECK ("readyAdded" >= 0),
  CONSTRAINT "ClientVideoWeek_delivered_nonnegative" CHECK ("delivered" >= 0),
  CONSTRAINT "ClientVideoWeek_version_positive" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "ClientVideoWeek_clientId_month_week_key" ON "ClientVideoWeek"("clientId","month","week");
CREATE INDEX "ClientVideoWeek_organizationId_month_idx" ON "ClientVideoWeek"("organizationId","month");
CREATE INDEX "ClientVideoWeek_clientId_month_idx" ON "ClientVideoWeek"("clientId","month");
ALTER TABLE "ClientVideoWeek" ADD CONSTRAINT "ClientVideoWeek_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientVideoWeek" ADD CONSTRAINT "ClientVideoWeek_clientId_fkey"
 FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientVideoWeek" ADD CONSTRAINT "ClientVideoWeek_updatedById_fkey"
 FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
