-- PostgreSQL truncates identifiers at 63 bytes. Normalize the historical index
-- name to Prisma's generated identifier without rewriting an applied migration.
ALTER INDEX IF EXISTS "WorkspaceMessage_organizationId_senderId_recipientId_createdAt_" RENAME TO "WorkspaceMessage_organizationId_senderId_recipientId_create_idx";
