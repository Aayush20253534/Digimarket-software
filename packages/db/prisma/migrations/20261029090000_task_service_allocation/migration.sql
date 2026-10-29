ALTER TABLE "Task" ADD COLUMN "serviceId" UUID;
ALTER TABLE "TaskRecurrence" ADD COLUMN "serviceId" UUID;
ALTER TABLE "Task" ADD CONSTRAINT "Task_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClientService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ClientService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Task_serviceId_status_idx" ON "Task"("serviceId","status");
