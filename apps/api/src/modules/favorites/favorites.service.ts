import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MessagePayload } from '@glimpse/shared';
import { PrismaService } from '../prisma/prisma.service';

type MessageRow = {
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
};

type FavoriteRow = {
  id: string;
  createdAt: Date;
  tags: string[];
  snapshotMessageId: string | null;
  snapshotConversationId: string | null;
  snapshotConversationTitle: string | null;
  snapshotConversationType: string | null;
  snapshotSenderId: string | null;
  snapshotSenderName: string | null;
  snapshotType: string | null;
  snapshotBody: string | null;
  snapshotMediaUrl: string | null;
  snapshotThumbnailUrl: string | null;
  snapshotTranscript: string | null;
  snapshotSourceLanguage: string | null;
  snapshotTranslations: unknown;
  snapshotCreatedAt: Date | null;
  message?: (MessageRow & { conversation?: { id: string; title: string | null; type: string } }) | null;
};

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async listFavorites(userId: string) {
    const rows = await this.prisma.messageFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { message: { include: { translations: true, conversation: { select: { id: true, title: true, type: true } } } } }
    });
    return rows.map((row) => this.toFavoriteView(row));
  }

  async addFavorite(userId: string, messageId?: string, tagsInput?: string[] | string) {
    if (!messageId) throw new BadRequestException('Message id is required.');
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { translations: true, conversation: { select: { id: true, title: true, type: true, members: { select: { userId: true } } } } }
    });
    if (!message || !message.conversation.members.some((member) => member.userId === userId)) throw new NotFoundException('Message was not found.');
    const snapshot = this.snapshotFromMessage(message);
    const tags = this.normalizeTags(tagsInput);
    const row = await this.prisma.messageFavorite.upsert({
      where: { userId_messageId: { userId, messageId } },
      update: { ...snapshot, tags },
      create: { userId, messageId, tags, ...snapshot },
      include: { message: { include: { translations: true, conversation: { select: { id: true, title: true, type: true } } } } }
    });
    return this.toFavoriteView(row);
  }

  async removeFavorite(userId: string, messageId: string) {
    await this.prisma.messageFavorite.deleteMany({ where: { userId, OR: [{ messageId }, { snapshotMessageId: messageId }] } });
  }

  private normalizeTags(tagsInput?: string[] | string) {
    const raw = Array.isArray(tagsInput) ? tagsInput : typeof tagsInput === 'string' ? tagsInput.split(/[,#，、\s]+/) : [];
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const item of raw) {
      const tag = String(item ?? '').trim().replace(/^#+/, '').slice(0, 24);
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length >= 8) break;
    }
    return tags;
  }
  private snapshotFromMessage(message: MessageRow & { conversation: { id: string; title: string | null; type: string } }) {
    return {
      snapshotMessageId: message.id,
      snapshotConversationId: message.conversationId,
      snapshotConversationTitle: message.conversation.title,
      snapshotConversationType: message.conversation.type,
      snapshotSenderId: message.senderId,
      snapshotSenderName: message.senderName,
      snapshotType: message.type,
      snapshotBody: message.body,
      snapshotMediaUrl: message.mediaUrl,
      snapshotThumbnailUrl: message.mediaThumbnailUrl,
      snapshotTranscript: message.transcript,
      snapshotSourceLanguage: message.sourceLanguage,
      snapshotTranslations: Object.fromEntries(message.translations.map((item) => [item.language.toLowerCase(), item.body])),
      snapshotCreatedAt: message.createdAt
    };
  }

  private toFavoriteView(row: FavoriteRow) {
    const conversation = row.message?.conversation ?? { id: row.snapshotConversationId ?? row.message?.conversationId ?? row.id, title: row.snapshotConversationTitle, type: row.snapshotConversationType ?? 'SINGLE' };
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      tags: row.tags ?? [],
      message: row.message ? this.toPayload(row.message) : this.toPayloadFromSnapshot(row),
      conversation
    };
  }

  private toPayloadFromSnapshot(row: FavoriteRow): MessagePayload {
    const translations = row.snapshotTranslations && typeof row.snapshotTranslations === 'object' && !Array.isArray(row.snapshotTranslations) ? row.snapshotTranslations as Record<string, string> : {};
    return {
      id: row.snapshotMessageId ?? row.id,
      conversationId: row.snapshotConversationId ?? row.message?.conversationId ?? row.id,
      senderId: row.snapshotSenderId ?? 'unknown',
      senderName: row.snapshotSenderName ?? undefined,
      type: (row.snapshotType ?? 'TEXT').toLowerCase() as MessagePayload['type'],
      body: row.snapshotBody ?? undefined,
      mediaUrl: row.snapshotMediaUrl ?? undefined,
      thumbnailUrl: row.snapshotThumbnailUrl ?? undefined,
      transcript: row.snapshotTranscript ?? undefined,
      sourceLanguage: row.snapshotSourceLanguage ? (row.snapshotSourceLanguage.toLowerCase() as MessagePayload['sourceLanguage']) : undefined,
      translations,
      createdAt: (row.snapshotCreatedAt ?? row.createdAt).toISOString()
    };
  }

  private toPayload(row: MessageRow): MessagePayload {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderName: row.senderName ?? undefined,
      type: row.type.toLowerCase() as MessagePayload['type'],
      body: row.body ?? undefined,
      mediaUrl: row.mediaUrl ?? undefined,
      thumbnailUrl: row.mediaThumbnailUrl ?? undefined,
      transcript: row.transcript ?? undefined,
      revokedAt: row.revokedAt?.toISOString() ?? undefined,
      replyToMessageId: row.replyToMessageId ?? undefined,
      replyToMessageSenderName: row.replyToMessageSenderName ?? undefined,
      replyToMessageType: row.replyToMessageType ? (row.replyToMessageType.toLowerCase() as MessagePayload['type']) : undefined,
      replyToMessageBody: row.replyToMessageBody ?? undefined,
      sourceLanguage: row.sourceLanguage ? (row.sourceLanguage.toLowerCase() as MessagePayload['sourceLanguage']) : undefined,
      translations: Object.fromEntries(row.translations.map((item) => [item.language.toLowerCase(), item.body])),
      createdAt: row.createdAt.toISOString()
    };
  }
}


