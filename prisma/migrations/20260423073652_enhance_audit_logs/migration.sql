-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "hash" TEXT,
ADD COLUMN     "newValues" JSONB,
ADD COLUMN     "oldValues" JSONB,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
