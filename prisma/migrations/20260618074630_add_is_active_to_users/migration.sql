/*
  Warnings:

  - The `status` column on the `TicketSale` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TicketSaleStatus" AS ENUM ('RESERVED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "TicketSale" DROP COLUMN "status",
ADD COLUMN     "status" "TicketSaleStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
