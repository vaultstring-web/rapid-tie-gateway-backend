-- CreateTable
CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlaggedTransaction" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "fraudRuleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" INTEGER NOT NULL,
    "metadata" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlaggedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudAlert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "transactionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FlaggedTransaction" ADD CONSTRAINT "FlaggedTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedTransaction" ADD CONSTRAINT "FlaggedTransaction_fraudRuleId_fkey" FOREIGN KEY ("fraudRuleId") REFERENCES "FraudRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FraudRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
