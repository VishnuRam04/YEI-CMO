-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kernel" JSONB NOT NULL,
    "voice" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idea',
    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "planItemId" TEXT,
    "channel" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "score" INTEGER,
    "subScores" JSONB,
    "reasons" JSONB,
    "usedKernel" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL,
    "conversions" INTEGER NOT NULL,
    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pattern" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "lift" DOUBLE PRECISION NOT NULL,
    "n" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StrategicDirective" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StrategicDirective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Asset_brandId_createdAt_idx" ON "Asset"("brandId", "createdAt");
CREATE INDEX "Metric_brandId_date_idx" ON "Metric"("brandId", "date");
CREATE INDEX "Pattern_brandId_dimension_idx" ON "Pattern"("brandId", "dimension");
CREATE INDEX "StrategicDirective_brandId_active_idx" ON "StrategicDirective"("brandId", "active");

ALTER TABLE "Plan" ADD CONSTRAINT "Plan_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StrategicDirective" ADD CONSTRAINT "StrategicDirective_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
