-- Add durable, brand-scoped conversation memory for the CMO agent.
CREATE TABLE "CmoConversation" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmoConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmoMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "presentation" TEXT NOT NULL DEFAULT 'brief',
    "response" JSONB,
    "delegations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CmoMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CmoConversation_brandId_updatedAt_idx"
ON "CmoConversation"("brandId", "updatedAt");

CREATE INDEX "CmoMessage_conversationId_createdAt_idx"
ON "CmoMessage"("conversationId", "createdAt");

ALTER TABLE "CmoConversation"
ADD CONSTRAINT "CmoConversation_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CmoMessage"
ADD CONSTRAINT "CmoMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "CmoConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
