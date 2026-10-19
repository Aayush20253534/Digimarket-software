-- Module 10 client-linked projects and deliverable approval integration
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED','ACTIVE','ON_HOLD','COMPLETED','ARCHIVED');
CREATE TYPE "ProjectMemberRole" AS ENUM ('MANAGER','CONTRIBUTOR','REVIEWER');
CREATE TYPE "MilestoneStatus" AS ENUM ('OPEN','DONE');
CREATE TYPE "DeliverableStatus" AS ENUM ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED');

CREATE TABLE "Project" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" VARCHAR(2000),
  "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
  "startOn" DATE,
  "dueOn" DATE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectMember" (
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "ProjectMemberRole" NOT NULL DEFAULT 'CONTRIBUTOR',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);
CREATE TABLE "ProjectMilestone" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "dueOn" DATE,
  "status" "MilestoneStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectDeliverable" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "milestoneId" UUID,
  "assetId" UUID,
  "approvalRequestId" UUID,
  "title" VARCHAR(180) NOT NULL,
  "description" VARCHAR(2000),
  "status" "DeliverableStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ProjectDeliverable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Project_organizationId_status_updatedAt_idx" ON "Project"("organizationId","status","updatedAt");
CREATE INDEX "Project_organizationId_clientId_createdAt_idx" ON "Project"("organizationId","clientId","createdAt");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX "ProjectMilestone_projectId_status_dueOn_idx" ON "ProjectMilestone"("projectId","status","dueOn");
CREATE UNIQUE INDEX "ProjectDeliverable_approvalRequestId_key" ON "ProjectDeliverable"("approvalRequestId");
CREATE INDEX "ProjectDeliverable_projectId_status_updatedAt_idx" ON "ProjectDeliverable"("projectId","status","updatedAt");
CREATE INDEX "ProjectDeliverable_milestoneId_idx" ON "ProjectDeliverable"("milestoneId");
CREATE INDEX "ProjectDeliverable_assetId_idx" ON "ProjectDeliverable"("assetId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDeliverable" ADD CONSTRAINT "ProjectDeliverable_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
