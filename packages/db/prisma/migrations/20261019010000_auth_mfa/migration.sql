-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "mfaVerifiedAt" TIMESTAMPTZ(6),
ADD COLUMN     "previousRefreshTokenHash" VARCHAR(255);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastMfaStep" INTEGER,
ADD COLUMN     "mfaPendingEncrypted" TEXT,
ADD COLUMN     "mfaPendingExpiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "mfaSecretEncrypted" TEXT;
