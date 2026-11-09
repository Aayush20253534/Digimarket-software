-- Festival-post readiness is independent of the existing regular post inventory.
-- Additive defaults preserve existing weeks and clients without data changes.
ALTER TABLE "ClientPostWeek"
  ADD COLUMN "festivalReadyAdded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "festivalDelivered" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "festivalNote" VARCHAR(500);

ALTER TABLE "ClientPostWeek"
  ADD CONSTRAINT "ClientPostWeek_festival_ready_nonnegative" CHECK ("festivalReadyAdded" >= 0),
  ADD CONSTRAINT "ClientPostWeek_festival_delivered_nonnegative" CHECK ("festivalDelivered" >= 0);
