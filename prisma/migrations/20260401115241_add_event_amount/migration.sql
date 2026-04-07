-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trustedDevices" JSONB,
ADD COLUMN     "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
