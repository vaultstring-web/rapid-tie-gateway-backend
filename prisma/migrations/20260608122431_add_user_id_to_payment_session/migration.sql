-- AlterTable
ALTER TABLE "DsaRequest" ADD COLUMN     "documents" JSONB;

-- AlterTable
ALTER TABLE "PaymentSession" ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
