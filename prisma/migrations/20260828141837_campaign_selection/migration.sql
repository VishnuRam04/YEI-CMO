-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "conversationId" TEXT,
    "strategyId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "strategy" JSONB NOT NULL,
    "executionPlan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_strategyId_key" ON "Campaign"("strategyId");

-- CreateIndex
CREATE INDEX "Campaign_brandId_createdAt_idx" ON "Campaign"("brandId", "createdAt");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
