-- Indexes on FK columns not covered by existing constraints
CREATE INDEX "ServerMember_serverId_idx" ON "ServerMember"("serverId");
CREATE INDEX "ServerWhitelist_serverId_idx" ON "ServerWhitelist"("serverId");
CREATE INDEX "DirectConversationMember_conversationId_idx" ON "DirectConversationMember"("conversationId");
CREATE INDEX "DirectAttachment_messageId_idx" ON "DirectAttachment"("messageId");
