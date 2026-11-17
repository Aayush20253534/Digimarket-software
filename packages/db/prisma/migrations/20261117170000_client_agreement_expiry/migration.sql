ALTER TYPE "ClientStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "Client"
  ADD COLUMN "agreementEndedOn" DATE,
  ADD COLUMN "agreementEndReason" VARCHAR(500);
