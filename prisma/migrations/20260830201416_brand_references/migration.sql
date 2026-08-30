-- CreateTable
CREATE TABLE "BrandReference" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandReference_brandId_role_idx" ON "BrandReference"("brandId", "role");

-- AddForeignKey
ALTER TABLE "BrandReference" ADD CONSTRAINT "BrandReference_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
