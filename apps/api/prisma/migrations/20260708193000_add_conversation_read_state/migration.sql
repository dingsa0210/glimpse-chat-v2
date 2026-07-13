ALTER TABLE "ConversationMember" ADD COLUMN "lastReadAt" TIMESTAMP(3);

CREATE INDEX "ConversationMember_userId_lastReadAt_idx" ON "ConversationMember"("userId", "lastReadAt");
