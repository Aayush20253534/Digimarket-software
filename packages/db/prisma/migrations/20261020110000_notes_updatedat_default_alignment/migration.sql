-- Align PersonalNote.updatedAt with Prisma @updatedAt (no database default).
-- Keep the previous Notes migration immutable for already deployed databases.
ALTER TABLE "PersonalNote" ALTER COLUMN "updatedAt" DROP DEFAULT;
