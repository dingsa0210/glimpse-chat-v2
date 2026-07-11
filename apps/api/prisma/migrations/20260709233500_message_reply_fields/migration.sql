ALTER TABLE "Message" ADD COLUMN "replyToMessageId" TEXT;
ALTER TABLE "Message" ADD COLUMN "replyToMessageSenderName" TEXT;
ALTER TABLE "Message" ADD COLUMN "replyToMessageType" "MessageType";
ALTER TABLE "Message" ADD COLUMN "replyToMessageBody" TEXT;
