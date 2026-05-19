-- Add canonicalKey to DirectConversation for race-free 1-on-1 DM lookups
ALTER TABLE "DirectConversation" ADD COLUMN "canonicalKey" TEXT;
CREATE UNIQUE INDEX "DirectConversation_canonicalKey_key" ON "DirectConversation"("canonicalKey");
