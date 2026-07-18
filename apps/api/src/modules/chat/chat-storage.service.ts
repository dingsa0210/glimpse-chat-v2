import type { MessagePayload, TranslationLanguage } from "@glimpse/shared";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SUPPORTED_TRANSLATION_LANGUAGES } from "@glimpse/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TranslationService } from "../translation/translation.service";
import { MediaService } from "../media/media.service";
import { VoiceTranscriptionService } from "../voice/voice-transcription.service";

type StoredMessage = MessagePayload;
type HistoryOptions = {
  before?: string;
  limit?: number;
};

const STORED_TRANSLATION_PREFIX = 'glimpse-translation:v1:';
type StoredTranslationRevision = {
  body: string;
  editedById: string;
  editedByName: string;
  editedAt: string;
};
type StoredTranslation = {
  original: string;
  edited?: StoredTranslationRevision;
  revisions?: StoredTranslationRevision[];
};

function isStoredTranslationRevision(value: unknown): value is StoredTranslationRevision {
  const revision = value as Partial<StoredTranslationRevision> | null;
  return Boolean(revision && typeof revision.body === "string" && typeof revision.editedById === "string" && typeof revision.editedByName === "string" && typeof revision.editedAt === "string");
}

function parseStoredTranslation(value: string): StoredTranslation {
  const safeValue = typeof value === "string" ? value : "";
  if (!safeValue.startsWith(STORED_TRANSLATION_PREFIX)) return { original: safeValue };
  try {
    const parsed = JSON.parse(safeValue.slice(STORED_TRANSLATION_PREFIX.length)) as Partial<StoredTranslation>;
    if (typeof parsed.original !== "string") return { original: safeValue };
    const revisions = Array.isArray(parsed.revisions) ? parsed.revisions.filter(isStoredTranslationRevision).slice(-50) : [];
    const edited = isStoredTranslationRevision(parsed.edited) ? parsed.edited : revisions.at(-1);
    if (!edited) return { original: parsed.original };
    return { original: parsed.original, edited, revisions: revisions.length ? revisions : [edited] };
  } catch {
    return { original: safeValue };
  }
}

function serializeStoredTranslation(original: string, edited?: StoredTranslationRevision, revisions?: StoredTranslationRevision[]) {
  return `${STORED_TRANSLATION_PREFIX}${JSON.stringify({ original, ...(edited ? { edited } : {}), ...(revisions?.length ? { revisions: revisions.slice(-50) } : {}) })}`;
}

function storedTranslationRevisions(stored: StoredTranslation) {
  return stored.revisions?.length ? stored.revisions : stored.edited ? [stored.edited] : [];
}

function storedTranslationRevisionKey(revision: StoredTranslationRevision) {
  return `${revision.editedById}:${revision.editedAt}`;
}

function mergedStoredTranslationRevisions(translations: Array<{ language: string; body: string }>) {
  const merged = new Map<string, StoredTranslationRevision>();
  for (const translation of translations) {
    for (const revision of storedTranslationRevisions(parseStoredTranslation(translation.body))) {
      const key = storedTranslationRevisionKey(revision);
      if (!merged.has(key)) merged.set(key, revision);
    }
  }
  return Array.from(merged.values())
    .sort((left, right) => new Date(left.editedAt).getTime() - new Date(right.editedAt).getTime())
    .slice(-50);
}

function newestStoredTranslation(
  translations: Array<{ language: string; body: string }>
): { language: TranslationLanguage; stored: StoredTranslation } | undefined {
  return translations
    .map((item) => ({ language: item.language.toLowerCase() as TranslationLanguage, stored: parseStoredTranslation(item.body) }))
    .filter((item) => item.stored.edited)
    .sort((left, right) => {
      const leftRevisions = storedTranslationRevisions(left.stored);
      const rightRevisions = storedTranslationRevisions(right.stored);
      const timeDifference = new Date(right.stored.edited?.editedAt ?? 0).getTime() - new Date(left.stored.edited?.editedAt ?? 0).getTime();
      return timeDifference || rightRevisions.length - leftRevisions.length;
    })[0];
}

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
type HistoryCursor = {
  createdAt: Date;
  id?: string;
};

function parseCursor(before?: string): HistoryCursor | undefined {
  if (!before) return undefined;
  const separatorIndex = before.lastIndexOf("|");
  const createdAtText = separatorIndex > 0 ? before.slice(0, separatorIndex) : before;
  const id = separatorIndex > 0 ? before.slice(separatorIndex + 1) : undefined;
  const createdAt = new Date(createdAtText);
  if (Number.isNaN(createdAt.getTime()) || (separatorIndex > 0 && !id)) {
    throw new BadRequestException("Invalid history cursor.");
  }
  return { createdAt, id };
}

function historyCursor(message: Pick<MessagePayload, "id" | "createdAt"> | undefined) {
  return message ? `${message.createdAt}|${message.id}` : undefined;
}

@Injectable()
export class ChatStorageService {
  private readonly logger = new Logger(ChatStorageService.name);
  private readonly memory = new Map<string, StoredMessage[]>();
  private readonly mode: "memory" | "prisma";

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly media: MediaService
  ) {
    this.mode = this.config.get<"memory" | "prisma">("CHAT_STORAGE", "prisma");
  }

  private async translateForLanguage(text: string, targetLanguage: TranslationLanguage, translation: TranslationService) {
    const normalized = text.trim();
    if (!normalized) return "";
    if (translation.isAlreadyTargetLanguage(normalized, targetLanguage)) return normalized;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const translated = (await translation.translateText(normalized, "auto", targetLanguage)).trim();
        if (translated) return translated;
        lastError = new Error(`Translation to ${targetLanguage} returned an empty result.`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Translation to ${targetLanguage} failed.`);
  }

  private async localizeRevisions(
    sourceRevisions: StoredTranslationRevision[],
    targetLanguage: TranslationLanguage,
    existing: StoredTranslation | undefined,
    translation: TranslationService,
    sourceLanguage?: TranslationLanguage
  ) {
    const existingByRevision = new Map(
      storedTranslationRevisions(existing ?? { original: "" }).map((revision) => [storedTranslationRevisionKey(revision), revision])
    );
    const localized: StoredTranslationRevision[] = [];
    for (const revision of sourceRevisions) {
      const previous = existingByRevision.get(storedTranslationRevisionKey(revision));
      const body = sourceLanguage === targetLanguage
        ? revision.body
        : previous?.body?.trim() || await this.translateForLanguage(revision.body, targetLanguage, translation);
      localized.push({ ...revision, body });
    }
    return localized;
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

    const cursor = parseCursor(options.before);
    const beforeTime = cursor?.createdAt.getTime() ?? Number.POSITIVE_INFINITY;
    const messages = (this.memory.get(conversationId) ?? [])
      .filter((message) => {
        const messageTime = new Date(message.createdAt).getTime();
        return messageTime < beforeTime || (
          Boolean(cursor?.id) &&
          messageTime === beforeTime &&
          message.id < cursor!.id!
        );
      })
      .sort((left, right) => {
        const timeDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return timeDifference || left.id.localeCompare(right.id);
      })
      .slice(-limit);
    return {
      conversationId,
      messages,
      nextCursor: messages.length === limit ? historyCursor(messages[0]) : undefined
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

    const existingTranslation = row.translations.find((item) => item.language.toLowerCase() === targetLanguage);
    const existingStored = existingTranslation ? parseStoredTranslation(existingTranslation.body) : undefined;
    const manualSource = newestStoredTranslation(row.translations);
    if (manualSource?.stored.edited) {
      const sourceRevisions = mergedStoredTranslationRevisions(row.translations);
      const existingRevisions = storedTranslationRevisions(existingStored ?? { original: "" });
      const targetIsCurrent =
        existingStored?.edited?.editedAt === sourceRevisions.at(-1)?.editedAt
        && existingRevisions.length === sourceRevisions.length
        && existingRevisions.every((revision, index) => {
          const sourceRevision = sourceRevisions[index];
          return Boolean(sourceRevision && storedTranslationRevisionKey(revision) === storedTranslationRevisionKey(sourceRevision));
        });
      if (!targetIsCurrent) {
        const localizedOriginal = existingStored?.original?.trim()
          || await this.translateForLanguage(row.body, targetLanguage, translation);
        const localizedRevisions = await this.localizeRevisions(
          sourceRevisions,
          targetLanguage,
          existingStored,
          translation
        );
        const localizedLatest = localizedRevisions.at(-1);
        await this.prisma.messageTranslation.upsert({
          where: { messageId_language: { messageId, language: targetLanguage } },
          update: { body: serializeStoredTranslation(localizedOriginal, localizedLatest, localizedRevisions) },
          create: {
            messageId,
            language: targetLanguage,
            body: serializeStoredTranslation(localizedOriginal, localizedLatest, localizedRevisions)
          }
        });
      }
      const updated = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: { translations: true }
      });
      if (!updated) throw new NotFoundException("Message not found.");
      return { message: this.toPayload(updated) };
    }

    if (translation.isAlreadyTargetLanguage(row.body, targetLanguage)) {
      return { message: this.toPayload(row), translationSkipped: "same-language" as const };
    }

    const translated = await translation.translateText(row.body, "auto", targetLanguage);
    if (!translated) throw new BadRequestException("Translation failed. Please try again.");

    const storedTranslation = existingTranslation ? parseStoredTranslation(existingTranslation.body) : undefined;
    const storedTranslationBody = serializeStoredTranslation(translated, storedTranslation?.edited, storedTranslation?.revisions);
    await this.prisma.messageTranslation.upsert({
      where: { messageId_language: { messageId, language: targetLanguage } },
      update: { body: storedTranslationBody },
      create: {
        messageId,
        language: targetLanguage,
        body: storedTranslationBody
      }
    });

    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { translations: true }
    });
    if (!updated) throw new NotFoundException("Message not found.");
    return { message: this.toPayload(updated) };
  }
  async editTranslation(
    conversationId: string,
    messageId: string,
    userId: string,
    editedByName: string,
    targetLanguage: TranslationLanguage,
    body: string,
    translation: TranslationService
  ) {
    if (this.mode !== 'prisma') throw new BadRequestException('Manual translation requires persistent storage.');
    await this.ensureConversationMember(conversationId, userId);
    const row = await this.prisma.message.findFirst({ where: { id: messageId, conversationId }, include: { translations: true } });
    if (!row) throw new NotFoundException('Message not found.');
    if (row.type !== 'TEXT' || !(row.body ?? '').trim()) throw new BadRequestException('Only text messages can be edited.');
    const editedBody = (typeof body === "string" ? body : "").trim().slice(0, 5000);
    if (!editedBody) throw new BadRequestException('Edited translation cannot be empty.');
    const editorName = typeof editedByName === "string" ? editedByName.trim() : "";
    const translationRow = row.translations.find((item) => item.language.toLowerCase() === targetLanguage);
    if (!translationRow?.body?.trim()) throw new BadRequestException('Translate the message before editing its translation.');
    const stored = parseStoredTranslation(translationRow.body);
    const editedAt = new Date().toISOString();
    const revision = { body: editedBody, editedById: userId, editedByName: editorName || userId, editedAt };
    const canonicalRevisions = mergedStoredTranslationRevisions(row.translations);
    const targetRevisions = storedTranslationRevisions(stored);
    const targetRevisionKeys = new Set(targetRevisions.map(storedTranslationRevisionKey));
    const targetHasCanonicalHistory =
      targetRevisions.length === canonicalRevisions.length
      && canonicalRevisions.every((revision) => targetRevisionKeys.has(storedTranslationRevisionKey(revision)));
    const baseRevisions = targetHasCanonicalHistory
      ? targetRevisions
      : await this.localizeRevisions(canonicalRevisions, targetLanguage, stored, translation);
    const revisions = [...baseRevisions, revision].slice(-50);

    const languagesToUpdate = Array.from(new Set<TranslationLanguage>([
      targetLanguage,
      ...row.translations
        .map((item) => item.language.toLowerCase() as TranslationLanguage)
        .filter((language) => SUPPORTED_TRANSLATION_LANGUAGES.includes(language))
    ]));
    const localizedTranslations = await Promise.all(
      languagesToUpdate.map(async (language) => {
        const existingRow = row.translations.find((item) => item.language.toLowerCase() === language);
        const existing = existingRow ? parseStoredTranslation(existingRow.body) : undefined;
        const original = existing?.original?.trim()
          || await this.translateForLanguage(row.body ?? "", language, translation);
        const localizedRevisions = await this.localizeRevisions(
          revisions,
          language,
          existing,
          translation,
          targetLanguage
        );
        const latest = localizedRevisions.at(-1);
        if (!latest) throw new BadRequestException(`Could not preserve translation revisions for ${language}.`);
        return { language, body: serializeStoredTranslation(original, latest, localizedRevisions) };
      })
    );

    await this.prisma.$transaction(
      localizedTranslations.map(({ language, body: localizedBody }) =>
        this.prisma.messageTranslation.upsert({
          where: { messageId_language: { messageId, language } },
          update: { body: localizedBody },
          create: { messageId, language, body: localizedBody }
        })
      )
    );
    const updated = await this.prisma.message.findUnique({ where: { id: messageId }, include: { translations: true } });
    if (!updated) throw new NotFoundException('Message not found.');
    return this.toPayload(updated);
  }

  async transcribeVoiceMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    targetLanguage: TranslationLanguage,
    media: MediaService,
    voice: VoiceTranscriptionService
  ) {
    if (this.mode !== "prisma") {
      throw new BadRequestException("Voice transcription requires persistent storage.");
    }
    await this.ensureConversationMember(conversationId, userId);
    const row = await this.prisma.message.findFirst({ where: { id: messageId, conversationId }, include: { translations: true } });
    if (!row) throw new NotFoundException("Message not found.");
    if (row.type !== "AUDIO" || !row.mediaUrl) throw new BadRequestException("Only audio messages can be transcribed.");

    const transcript = row.transcript?.trim() || await voice.transcribeAudio({ ...media.readMediaFileByUrl(row.mediaUrl), mediaUrl: row.mediaUrl });
    if (!row.transcript?.trim()) await this.prisma.message.update({ where: { id: messageId }, data: { transcript } });

    const hasTranslation = row.translations.some((item) => item.language.toLowerCase() === targetLanguage && item.body.trim());
    if (!hasTranslation) {
      const translated = await voice.translateTranscript(transcript, targetLanguage);
      if (translated) await this.prisma.messageTranslation.upsert({
        where: { messageId_language: { messageId, language: targetLanguage } },
        update: { body: translated },
        create: { messageId, language: targetLanguage, body: translated }
      });
    }

    const updated = await this.prisma.message.findUnique({ where: { id: messageId }, include: { translations: true } });
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

  async deleteMessages(conversationId: string, messageIds: string[], userId: string) {
    const uniqueIds = Array.from(new Set(messageIds.filter(Boolean))).slice(0, 99);
    if (!uniqueIds.length) throw new BadRequestException("Select at least one message to delete.");
    if (this.mode !== "prisma") {
      const history = this.memory.get(conversationId) ?? [];
      const selected = history.filter((item) => uniqueIds.includes(item.id));
      if (selected.length !== uniqueIds.length) throw new NotFoundException("One or more messages were not found.");
      if (selected.some((item) => item.senderId !== userId)) throw new ForbiddenException("You can only delete messages that you sent.");
      this.memory.set(conversationId, history.filter((item) => !uniqueIds.includes(item.id)));
      selected.forEach((item) => {
        if (item.mediaUrl) this.media.removeMediaFileByUrl(item.mediaUrl);
        if (item.thumbnailUrl) this.media.removeMediaFileByUrl(item.thumbnailUrl);
      });
      return selected;
    }
    await this.ensureConversationMember(conversationId, userId);
    const rows = await this.prisma.message.findMany({ where: { conversationId, id: { in: uniqueIds } }, include: { translations: true } });
    if (rows.length !== uniqueIds.length) throw new NotFoundException("One or more messages were not found.");
    if (rows.some((row) => row.senderId !== userId)) throw new ForbiddenException("You can only delete messages that you sent.");
    await this.prisma.$transaction(async (transaction) => {
      await transaction.messageTranslation.deleteMany({ where: { messageId: { in: uniqueIds } } });
      await transaction.message.deleteMany({ where: { conversationId, id: { in: uniqueIds } } });
    });
    rows.forEach((row) => {
      if (row.mediaUrl) this.media.removeMediaFileByUrl(row.mediaUrl);
      if (row.mediaThumbnailUrl) this.media.removeMediaFileByUrl(row.mediaThumbnailUrl);
    });
    return rows.map((row) => this.toPayload(row));
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
    mediaSizeBytes: bigint | null;
    transcript: string | null;
    revokedAt: Date | null;
    replyToMessageId: string | null;
    replyToMessageSenderName: string | null;
   replyToMessageType: string | null;
   replyToMessageBody: string | null;
   sourceLanguage: string | null;
    albumId: string | null;
    albumIndex: number | null;
    albumSize: number | null;
   createdAt: Date;
    translations: Array<{ language: string; body: string }>;
  }): MessagePayload {
    const translations: Record<string, string> = {};
    const manualTranslations: MessagePayload['manualTranslations'] = {};
    for (const item of row.translations) {
      const language = item.language.toLowerCase();
      const stored = parseStoredTranslation(item.body);
      translations[language] = stored.original;
      if (stored.edited) manualTranslations[language as TranslationLanguage] = { ...stored.edited, originalBody: stored.original, revisions: stored.revisions };
    }
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderName: row.senderName ?? undefined,
      type: row.type.toLowerCase() as MessagePayload["type"],
      body: row.body ?? undefined,
      mediaUrl: row.mediaUrl ?? undefined,
      thumbnailUrl: row.mediaThumbnailUrl ?? undefined,
      mediaSizeBytes: row.mediaSizeBytes === null ? this.media.mediaFileSizeByUrl(row.mediaUrl) : Number(row.mediaSizeBytes),
      transcript: row.transcript ?? undefined,
      revokedAt: row.revokedAt?.toISOString() ?? undefined,
      replyToMessageId: row.replyToMessageId ?? undefined,
      replyToMessageSenderName: row.replyToMessageSenderName ?? undefined,
     replyToMessageType: row.replyToMessageType ? (row.replyToMessageType.toLowerCase() as MessagePayload["type"]) : undefined,
     replyToMessageBody: row.replyToMessageBody ?? undefined,
     sourceLanguage: row.sourceLanguage ? (row.sourceLanguage.toLowerCase() as MessagePayload["sourceLanguage"]) : undefined,
      albumId: row.albumId ?? undefined,
      albumIndex: row.albumIndex ?? undefined,
      albumSize: row.albumSize ?? undefined,
     translations,
      ...(Object.keys(manualTranslations).length ? { manualTranslations } : {}),
      createdAt: row.createdAt.toISOString()
    };
  }
  private async getPrismaHistory(conversationId: string, before: string | undefined, limit: number) {
    const cursor = parseCursor(before);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            ...(cursor.id ? [{ createdAt: cursor.createdAt, id: { lt: cursor.id } }] : [])
          ]
        } : {})
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ],
      take: limit,
      include: { translations: true }
    });
    const messages = rows.reverse().map((row) => this.toPayload(row));

    return {
      conversationId,
      messages,
      nextCursor: rows.length === limit ? historyCursor(messages[0]) : undefined
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
        mediaSizeBytes: typeof message.mediaSizeBytes === "number" ? BigInt(Math.max(0, Math.trunc(message.mediaSizeBytes))) : undefined,
        transcript: message.transcript,
        revokedAt: message.revokedAt ? new Date(message.revokedAt) : undefined,
        replyToMessageId: message.replyToMessageId,
        replyToMessageSenderName: message.replyToMessageSenderName,
       replyToMessageType: message.replyToMessageType?.toUpperCase() as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | undefined,
       replyToMessageBody: message.replyToMessageBody,
       sourceLanguage: message.sourceLanguage,
        albumId: message.albumId,
        albumIndex: message.albumIndex,
        albumSize: message.albumSize,
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






