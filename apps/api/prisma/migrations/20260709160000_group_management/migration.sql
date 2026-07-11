ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "announcement" TEXT;
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "invitedById" TEXT;
CREATE INDEX IF NOT EXISTS "ConversationMember_invitedById_idx" ON "ConversationMember"("invitedById");
