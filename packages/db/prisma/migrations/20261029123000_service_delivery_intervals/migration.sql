ALTER TABLE "ServiceDeliverySchedule"
 ADD COLUMN "repeatEveryDays" INTEGER;

ALTER TABLE "ServiceDeliverySchedule"
 ADD CONSTRAINT "ServiceDeliverySchedule_repeatEveryDays_range_chk"
 CHECK ("repeatEveryDays" IS NULL OR "repeatEveryDays" BETWEEN 2 AND 31);
