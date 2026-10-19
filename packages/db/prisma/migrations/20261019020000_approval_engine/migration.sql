CREATE TYPE "ApprovalCategory" AS ENUM ('GENERAL', 'FINANCE', 'CONTENT', 'DELIVERABLE');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalOutcome" AS ENUM ('APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ApprovalPolicy" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL,
  "category" "ApprovalCategory" NOT NULL, "name" VARCHAR(160) NOT NULL,
  "approverRoleKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ApprovalRequest" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "policyId" UUID NOT NULL,
  "requesterId" UUID NOT NULL, "title" VARCHAR(180) NOT NULL,
  "description" TEXT NOT NULL, "referenceType" VARCHAR(80), "referenceId" VARCHAR(160),
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approverRoleKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMPTZ(6),
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ApprovalDecision" (
  "id" UUID NOT NULL, "requestId" UUID NOT NULL, "actorId" UUID NOT NULL,
  "outcome" "ApprovalOutcome" NOT NULL, "reason" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApprovalPolicy_organizationId_category_key" ON "ApprovalPolicy"("organizationId", "category");
CREATE INDEX "ApprovalPolicy_organizationId_active_idx" ON "ApprovalPolicy"("organizationId", "active");
CREATE INDEX "ApprovalRequest_organizationId_status_createdAt_idx" ON "ApprovalRequest"("organizationId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_organizationId_requesterId_createdAt_idx" ON "ApprovalRequest"("organizationId", "requesterId", "createdAt");
CREATE UNIQUE INDEX "ApprovalDecision_requestId_key" ON "ApprovalDecision"("requestId");
CREATE INDEX "ApprovalDecision_actorId_createdAt_idx" ON "ApprovalDecision"("actorId", "createdAt");
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ApprovalPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
