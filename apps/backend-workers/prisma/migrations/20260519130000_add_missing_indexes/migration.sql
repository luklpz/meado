-- Missing indexes on FK columns (PostgreSQL does not auto-index foreign keys)
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");
CREATE INDEX "Channel_serverId_idx" ON "Channel"("serverId");
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");
