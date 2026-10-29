CREATE TYPE "ServiceOccurrenceStatus" AS ENUM ('PENDING','COMPLETED');
CREATE TABLE "ServiceDeliverySchedule" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,"clientId" UUID NOT NULL,"serviceId" UUID,
 "title" VARCHAR(180) NOT NULL,"assigneeId" UUID NOT NULL,"createdById" UUID NOT NULL,
 "startOn" DATE NOT NULL,"endOn" DATE NOT NULL,"weekdays" INTEGER[] NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,"version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "ServiceDeliverySchedule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceDeliveryOccurrence"(
 "id" UUID NOT NULL,"scheduleId" UUID NOT NULL,
 "scheduledOn" DATE NOT NULL,"status" "ServiceOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
 "completedAt" TIMESTAMPTZ(6),"completedById" UUID,"version" INTEGER NOT NULL DEFAULT 1,
 CONSTRAINT "ServiceDeliveryOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceDeliveryOccurrence_scheduleId_scheduledOn_key" ON "ServiceDeliveryOccurrence"("scheduleId","scheduledOn");
CREATE INDEX "ServiceDeliveryOccurrence_status_scheduledOn_idx" ON "ServiceDeliveryOccurrence"("status","scheduledOn");
CREATE INDEX "ServiceDeliverySchedule_organizationId_clientId_startOn_idx" ON "ServiceDeliverySchedule"("organizationId","clientId","startOn");
CREATE INDEX "ServiceDeliverySchedule_organizationId_assigneeId_active_idx" ON "ServiceDeliverySchedule"("organizationId","assigneeId","active");
ALTER TABLE "ServiceDeliverySchedule" ADD CONSTRAINT "ServiceDeliverySchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDeliverySchedule" ADD CONSTRAINT "ServiceDeliverySchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDeliverySchedule" ADD CONSTRAINT "ServiceDeliverySchedule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClientService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDeliverySchedule" ADD CONSTRAINT "ServiceDeliverySchedule_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDeliverySchedule" ADD CONSTRAINT "ServiceDeliverySchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDeliveryOccurrence" ADD CONSTRAINT "ServiceDeliveryOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ServiceDeliverySchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDeliveryOccurrence" ADD CONSTRAINT "ServiceDeliveryOccurrence_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
