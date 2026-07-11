import type { MessagePayload, TranslationLanguage } from "@glimpse/shared";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { TranslationService } from "../translation/translation.service";

type StoredMessage = MessagePayload;
type HistoryOptions = {
  before?: string;
  limit?: number;
};

function normalizeMessage(message: MessagePayload): MessagePayload {
  return {
    ...message,
    id: message.id || `server-${Date.now()}`,
    type: message.type || "text",
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function clampLimit(limit = 50) {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function revokeWindowMs(type: MessagePayload["type"]) {
  if (type === "text") return 2 * 60 * 1000;
  if (type === "file") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}
function parseCursor(before?: string) {
  if (!before) return undefined;
  const value = new Date(before);
  if (Number.isNaN(value.getTime())) throw new BadRequestException("Invalid history cursor.");
  return value;
}

@Injectable()
export class ChatStorageService {
  private readonly logger = new Logger(ChatStorageService.name);
  private readonly memory = new Map<string, StoredMessage[]>();
  private readonly mode: "memory" | "prisma";

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    this.mode = this.config.get<"memory" | "prisma">("CHAT_STORAGE", "prisma");
  }

  async ensureConversationMember(conversationId: string, userId: string) {
    if (this.mode !== "prisma") return;
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!membership) throw new ForbiddenException("You are not a member of this conversation.");
  }

  async getHistory(conversationId: string, userId: string, options: HistoryOptions = {}) {
    const page = await this.getHistoryPage(conversationId, userId, options);
    return page.messages;
  }

  async getHistoryPage(conversationId: string, userId: string, options: HistoryOptions = {}) {
    const limit = clampLimit(options.limit);
    if (this.mode === "prisma") {
      await this.ensureConversationMember(conversationId, userId);
      return this.getPrismaHistory(conversationId, options.before, limit);
    }

    const beforeDate = parseCursor(options.before);
    const beforeTime = beforeDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const messages = (this.memory.get(conversationId) ?? [])
      .filter((message) => new Date(message.createdAt).getTime() < beforeTime)
      .slice(-limit);
    return {
      conversationId,
      messages,
      nextCursor: messages.length === limit ? messages[0]?.createdAt : undefined
    };
  }

  async markConversationRead(conversationId: string, userId: string) {
    const readAt = new Date();
    if (this.mode !== "prisma") return readAt;
    await this.ensureConversationMember(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: readAt }
    });
    return readAt;
  }


  async translateMessage(conversationId: string, messageId: string, userId: string, targetLanguage: TranslationLanguage, translation: TranslationService) {
    if (this.mode !== "prisma") {
      throw new BadRequestException("Manual translation requires persistent storage.");
    }
    await this.ensureConversationMember(conversationId, userId);
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      include: { translations: true }
    });
    if (!row) throw new NotFoundException("Message not found.");
    if (row.type !== "TEXT" || !row.body?.trim()) throw new BadRequestException("Only text messages can be translated.");

    const translated = await translation.translateText(row.body, "auto", targetLanguage);
    if (!translated) throw new BadRequestException("Translation failed. Please try again.");

    await this.prisma.messageTranslation.upsert({
      where: { messageId_language: { messageId, language: targetLanguage } },
      update: { body: translated },
      create: {
        messageId,
        language: targetLanguage,
        body: translated
      }
    });

    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { translations: true }
    });
    if (!updated) throw new NotFoundException("Message not found.");
    return this.toPayload(updated);
  }
  async saveMessage(message: MessagePayload, userId: string) {
    const normalized = normalizeMessage(message);
    if (this.mode === "prisma") {
      await this.ensureConversationMember(normalized.conversationId, userId);
      await this.ensureMessageNotBlocked(normalized.conversationId, userId);
      try {
        await this.savePrismaMessage(normalized);
        return normalized;
      } catch (error) {
        this.logger.error("Prisma chat storage failed", error instanceof Error ? error.stack : String(error));
        throw error;
      }
    }
    const history = this.memory.get(normalized.conversationId) ?? [];
    history.push(normalized);
    this.memory.set(normalized.conversationId, history.slice(-200));
    return normalized;
  }




  async revokeMessage(conversationId: string, messageId: string, userId: string) {
    const now = new Date();
    if (this.mode !== "prisma") {
      const history = this.memory.get(conversationId) ?? [];
      const message = history.find((item) => item.id === messageId);
      if (!message) throw new NotFoundException("Message not found.");
      if (message.senderId !== userId) throw new ForbiddenException("Only the sender can revoke this message.");
      if (message.revokedAt) return message;
      const createdAt = new Date(message.createdAt).getTime();
      if (Number.isNaN(createdAt) || now.getTime() - createdAt > revokeWindowMs(message.type)) throw new BadRequestException("This message can no longer be revoked.");
      message.revokedAt = now.toISOString();
      this.memory.set(conversationId, history);
      return message;
    }

    await this.ensureConversationMember(conversationId, userId);
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      include: { translations: true }
    });
    if (!row) throw new NotFoundException("Message not found.");
    if (row.senderId !== userId) throw new ForbiddenException("Only the sender can revoke this message.");
    if (row.revokedAt) return this.toPayload(row);
    const type = row.type.toLowerCase() as MessagePayload["type"];
    if (now.getTime() - row.createdAt.getTime() > revokeWindowMs(type)) throw new BadRequestException("This message can no longer be revoked.");
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { revokedAt: now },
      include: { translations: true }
    });
    return this.toPayload(updated);
  }
  private async ensureMessageNotBlocked(conversationId: string, senderId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: { userId: true } } }
    });
    if (!conversation || conversation.type !== "DIRECT") return;
    const otherUserIds = conversation.members.filter((member) => member.userId !== senderId).map((member) => member.userId);
    if (otherUserIds.length === 0) return;
    const blockCount = await this.prisma.userBlock.count({
      where: {
        OR: [
          { blockerId: senderId, blockedId: { in: otherUserIds } },
          { blockerId: { in: otherUserIds }, blockedId: senderId }
        ]
      }
    });
    if (blockCount > 0) throw new ForbiddenException("Cannot send messages to a blocked user.");
  }
  private toPayload(row: {
    id: string;
    conversationId: string;
    senderId: string;
    senderName: string | null;
    type: string;
    body: string | null;
    mediaUrl: string | null;
    mediaThumbnailUrl: string | null;
    transcript: string | null;
    revokedAt: Date | null;
    replyToMessageId: string | null;
    replyToMessageSenderName: string | null;
    replyToMessageType: string | null;
    replyToMessageBody: string | null;
    sourceLanguage: string | null;
    createdAt: Date;
    translations: Array<{ language: string; body: string }>;
  }): MessagePayload {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderName: row.senderName ?? undefined,
      type: row.type.toLowerCase() as MessagePayload["type"],
      body: row.body ?? undefined,
      mediaUrl: row.mediaUrl ?? undefined,
      thumbnailUrl: row.mediaThumbnailUrl ?? undefined,
      transcript: row.transcript ?? undefined,
      revokedAt: row.revokedAt?.toISOString() ?? undefined,
      replyToMessageId: row.replyToMessageId ?? undefined,
      replyToMessageSenderName: row.replyToMessageSenderName ?? undefined,
      replyToMessageType: row.replyToMessageType ? (row.replyToMessageType.toLowerCase() as MessagePayload["type"]) : undefined,
      replyToMessageBody: row.replyToMessageBody ?? undefined,
      sourceLanguage: row.sourceLanguage ? (row.sourceLanguage.toLowerCase() as MessagePayload["sourceLanguage"]) : undefined,
      translations: Object.fromEntries(row.translations.map((item) => [item.language.toLowerCase(), item.body])),
      createdAt: row.createdAt.toISOString()
    };
  }
  private async getPrismaHistory(conversationId: string, before: string | undefined, limit: number) {
    const beforeDate = parseCursor(before);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { translations: true }
    });
    const messages = rows.reverse().map((row) => this.toPayload(row));

    return {
      conversationId,
      messages,
      nextCursor: rows.length === limit ? messages[0]?.createdAt : undefined
    };
  }

  private async savePrismaMessage(message: MessagePayload) {
    await this.prisma.message.upsert({
      where: { id: message.id },
      update: {},
      create: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderName: message.senderName,
        type: message.type.toUpperCase() as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE",
        body: message.body,
        mediaUrl: message.mediaUrl,
        mediaThumbnailUrl: message.thumbnailUrl,
        transcript: message.transcript,
        revokedAt: message.revokedAt ? new Date(message.revokedAt) : undefined,
        replyToMessageId: message.replyToMessageId,
        replyToMessageSenderName: message.replyToMessageSenderName,
        replyToMessageType: message.replyToMessageType?.toUpperCase() as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | undefined,
        replyToMessageBody: message.replyToMessageBody,
        sourceLanguage: message.sourceLanguage,
        createdAt: new Date(message.createdAt),
        translations: {
          create: Object.entries(message.translations ?? {}).map(([language, body]) => ({
            language,
            body
          }))
        }
      }
    });
  }
}





