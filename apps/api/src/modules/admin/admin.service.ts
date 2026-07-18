import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { readdir, stat, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import * as argon2 from "argon2";
import { ADMIN_PERMISSION_OPTIONS } from "@glimpse/shared";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ChatGateway } from "../chat/chat.gateway";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { OcrService } from "../ocr/ocr.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { TranslationService } from "../translation/translation.service";
import { VoiceTranscriptionService } from "../voice/voice-transcription.service";

type AdminPermissionCode = (typeof ADMIN_PERMISSION_OPTIONS)[number]["code"];
const VALID_ADMIN_PERMISSION_CODES = new Set<string>(ADMIN_PERMISSION_OPTIONS.map((item) => item.code));

async function directorySizeBytes(root: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  const sizes = await Promise.all(entries.map(async (entry): Promise<number> => {
    if (entry.isSymbolicLink()) return 0;
    const fullPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return directorySizeBytes(fullPath);
    }
    if (!entry.isFile()) return 0;
    try {
      return (await stat(fullPath)).size;
    } catch {
      // A file may disappear while logs or build outputs are rotating.
      return 0;
    }
  }));
  return sizes.reduce((total, size) => total + size, 0);
}

function normalizeAdminPermissions(values: unknown): AdminPermissionCode[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((item) => String(item).trim()).filter((item) => VALID_ADMIN_PERMISSION_CODES.has(item)))) as AdminPermissionCode[];
}

function cleanAdminText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

const ADMIN_PASSWORD_HASH_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
};

function sloganFingerprint(value: string) {
  return String(value ?? "").toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function sloganSimilarity(left: string, right: string) {
  const a = sloganFingerprint(left);
  const b = sloganFingerprint(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value: string) => {
    const result = new Set<string>();
    const size = value.length < 8 ? 2 : 3;
    for (let index = 0; index <= value.length - size; index += 1) result.add(value.slice(index, index + size));
    return result;
  };
  const leftGrams = grams(a);
  const rightGrams = grams(b);
  let common = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) common += 1;
  return (2 * common) / Math.max(1, leftGrams.size + rightGrams.size);
}

function toAdminUser(row: {
  id: string;
  email: string | null;
  phone: string | null;
  publicId?: string | null;
  profilePublic?: boolean | null;
  profileEmailPublic?: boolean | null;
  profilePhonePublic?: boolean | null;
  nickname: string;
  avatarUrl?: string | null;
  profileCompany?: string | null;
  profileTitle?: string | null;
  profileLocation?: string | null;
  profileBio?: string | null;
  profileSignature?: string | null;
  language: string;
  role: string;
  isSuperAdmin?: boolean;
  adminPermissions?: string[];
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}, isSuperAdmin = Boolean(row.isSuperAdmin)) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    publicId: row.publicId ?? null,
    profilePublic: row.profilePublic ?? true,
    profileEmailPublic: row.profileEmailPublic ?? false,
    profilePhonePublic: row.profilePhonePublic ?? false,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl ?? null,
    profileCompany: row.profileCompany ?? null,
    profileTitle: row.profileTitle ?? null,
    profileLocation: row.profileLocation ?? null,
    profileBio: row.profileBio ?? null,
    profileSignature: row.profileSignature ?? null,
    language: row.language.toLowerCase(),
    role: isSuperAdmin ? "super_admin" : row.role.toLowerCase(),
    isSuperAdmin,
    adminPermissions: row.adminPermissions ?? [],
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}


type AdminConversationRow = {
  id: string;
  type: string;
  title: string | null;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    userId: string;
    joinedAt: Date;
    lastReadAt: Date | null;
    user: {
      id: string;
      email: string | null;
      phone: string | null;
      nickname: string;
      disabledAt: Date | null;
    };
  }>;
  _count: { members: number; messages: number };
};

function toAdminConversation(row: AdminConversationRow) {
  return {
    id: row.id,
    type: row.type.toLowerCase(),
    title: row.title,
    ownerId: row.ownerId,
    memberCount: row._count.members,
    messageCount: row._count.messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    members: row.members.map((member) => ({
      userId: member.userId,
      nickname: member.user.nickname,
      email: member.user.email,
      phone: member.user.phone,
      disabledAt: member.user.disabledAt?.toISOString() ?? null,
      joinedAt: member.joinedAt.toISOString(),
      lastReadAt: member.lastReadAt?.toISOString() ?? null
    }))
  };
}
type AdminMessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  type: string;
  body: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  sourceLanguage: string | null;
  createdAt: Date;
  sender: {
    id: string;
    email: string | null;
    phone: string | null;
    nickname: string;
    disabledAt: Date | null;
  } | null;
  translations: Array<{
    language: string;
    body: string;
    createdAt: Date;
  }>;
};

function toAdminMessage(row: AdminMessageRow) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: row.senderName ?? row.sender?.nickname ?? "Unknown",
    type: row.type.toLowerCase(),
    body: row.body,
    mediaUrl: row.mediaUrl,
    mediaThumbnailUrl: row.mediaThumbnailUrl,
    sourceLanguage: row.sourceLanguage,
    createdAt: row.createdAt.toISOString(),
    sender: row.sender
      ? {
          id: row.sender.id,
          nickname: row.sender.nickname,
          email: row.sender.email,
          phone: row.sender.phone,
          disabledAt: row.sender.disabledAt?.toISOString() ?? null
        }
      : null,
    translations: row.translations.map((translation) => ({
      language: translation.language,
      body: translation.body,
      createdAt: translation.createdAt.toISOString()
    }))
  };
}

type AdminFeedbackRow = {
  id: string;
  userId: string;
  category: string;
  message: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    nickname: string;
    disabledAt: Date | null;
  };
};

const ADMIN_FEEDBACK_STATUSES = new Set(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]);

function normalizeFeedbackStatus(value: string) {
  return value.trim().toUpperCase();
}

function toAdminFeedback(row: AdminFeedbackRow) {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category,
    message: row.message,
    attachmentUrl: row.attachmentUrl ?? null,
    status: row.status.toLowerCase(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: {
      id: row.user.id,
      email: row.user.email,
      phone: row.user.phone,
      nickname: row.user.nickname,
      disabledAt: row.user.disabledAt?.toISOString() ?? null
    }
  };
}
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly mail: MailService,
    private readonly translation: TranslationService,
    private readonly voice: VoiceTranscriptionService,
    private readonly ocr: OcrService,
    private readonly chatGateway: ChatGateway
  ) {}

  private storageCache: { expiresAt: number; value: { projectRoot: string; projectBytes: number; freeBytes: number; totalBytes: number; measuredAt: string } } | null = null;

  private async storageOverview() {
    if (this.storageCache && this.storageCache.expiresAt > Date.now()) return this.storageCache.value;
    const projectRoot = resolve(__dirname, "../../../../..");
    const [projectBytes, disk] = await Promise.all([
      directorySizeBytes(projectRoot),
      statfs(projectRoot, { bigint: true })
    ]);
    const value = {
      projectRoot,
      projectBytes,
      freeBytes: Number(disk.bavail * disk.bsize),
      totalBytes: Number(disk.blocks * disk.bsize),
      measuredAt: new Date().toISOString()
    };
    this.storageCache = { expiresAt: Date.now() + 60_000, value };
    return value;
  }

  async overview() {
    const [users, disabledUsers, conversations, messages, openFeedback] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { disabledAt: { not: null } } }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.feedback.count({ where: { status: "OPEN" } })
    ]);
    const [storage, presence] = await Promise.all([
      this.storageOverview(),
      Promise.resolve(this.chatGateway.getPresenceSummary())
    ]);
    return { users, disabledUsers, conversations, messages, openFeedback, ...presence, storage };
  }

  async users(query = "") {
    const keyword = query.trim();
    const where: Prisma.UserWhereInput | undefined = keyword
      ? {
          OR: [
            { id: { contains: keyword, mode: "insensitive" } },
            { email: { contains: keyword, mode: "insensitive" } },
            { phone: { contains: keyword, mode: "insensitive" } },
            { nickname: { contains: keyword, mode: "insensitive" } },
            { profileCompany: { contains: keyword, mode: "insensitive" } },
            { profileTitle: { contains: keyword, mode: "insensitive" } },
            { profileLocation: { contains: keyword, mode: "insensitive" } }
          ]
        }
      : undefined;
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: keyword ? 500 : 1000,
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true,
        avatarUrl: true,
        profileCompany: true,
        profileTitle: true,
        profileLocation: true,
        profileBio: true, profileSignature: true, profilePublic: true, profileEmailPublic: true, profilePhonePublic: true, publicId: true,
        language: true,
        role: true,
        isSuperAdmin: true,
        adminPermissions: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return rows.map((row) => toAdminUser(row));
  }


  async feedback() {
    const rows = await this.prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, email: true, phone: true, nickname: true, disabledAt: true } }
      }
    });
    return rows.map(toAdminFeedback);
  }

  async updateFeedbackStatus(feedbackId: string, status: string) {
    const normalized = normalizeFeedbackStatus(status);
    if (!ADMIN_FEEDBACK_STATUSES.has(normalized)) throw new BadRequestException("Unsupported feedback status.");

    const existing = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!existing) throw new NotFoundException("Feedback was not found.");

    const feedback = await this.prisma.feedback.update({
      where: { id: feedbackId },
      data: { status: normalized },
      include: {
        user: { select: { id: true, email: true, phone: true, nickname: true, disabledAt: true } }
      }
    });
    return toAdminFeedback(feedback);
  }
  async conversations() {
    const rows = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        members: {
          orderBy: { joinedAt: "asc" },
          include: {
            user: {
              select: { id: true, email: true, phone: true, nickname: true, disabledAt: true }
            }
          }
        },
        _count: { select: { members: true, messages: true } }
      }
    });
    return rows.map(toAdminConversation);
  }

  async userChats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true,
        avatarUrl: true,
        profileCompany: true,
        profileTitle: true,
        profileLocation: true,
        profileBio: true, profileSignature: true, profilePublic: true, profileEmailPublic: true, profilePhonePublic: true, publicId: true,
        language: true,
        role: true,
        isSuperAdmin: true,
        adminPermissions: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!user) throw new NotFoundException("User was not found.");

    const rows = await this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
      include: {
        members: {
          orderBy: { joinedAt: "asc" },
          include: {
            user: { select: { id: true, email: true, phone: true, nickname: true, disabledAt: true } }
          }
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: { select: { id: true, email: true, phone: true, nickname: true, disabledAt: true } },
            translations: { orderBy: { createdAt: "asc" } }
          }
        },
        _count: { select: { members: true, messages: true } }
      }
    });

    return {
      user: toAdminUser(user),
      conversations: rows.map((row) => ({
        ...toAdminConversation(row),
        messages: row.messages.map(toAdminMessage)
      }))
    };
  }
  async resetUserPassword(userId: string, actorId: string) {
    if (userId === actorId) throw new BadRequestException("You cannot reset your own password here.");

    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User was not found.");

    if (this.isSuperAdminAccount(existing)) throw new ForbiddenException("A super administrator password cannot be reset by another administrator.");
    const temporaryPassword = `Tmp-${randomBytes(9).toString("base64url")}`;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(temporaryPassword, ADMIN_PASSWORD_HASH_OPTIONS) }
    });

    return { user: toAdminUser(user), temporaryPassword };
  }
  async setUserDisabled(userId: string, disabled: boolean, actorId: string) {
    if (userId === actorId) throw new BadRequestException("You cannot disable your own account.");

    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User was not found.");
    if (this.isSuperAdminAccount(existing)) throw new ForbiddenException("A super administrator cannot be disabled by another administrator.");

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { disabledAt: disabled ? new Date() : null }
    });

    return toAdminUser(user);
  }
  assertPermission(actor: AuthenticatedUser, permission: AdminPermissionCode) {
    if (actor.role !== "admin") throw new ForbiddenException("Admin access is required.");
    const permissions = actor.adminPermissions ?? [];
    if (permissions.length === 0 || permissions.includes(permission)) return;
    throw new ForbiddenException("This administrator does not have permission for this action.");
  }

  assertSuperAdmin(actor: AuthenticatedUser) {
    if (actor.role === "admin" && actor.isSuperAdmin) return;
    throw new ForbiddenException("Super administrator access is required.");
  }

  private isSuperAdminEmail(email: string | null | undefined) {
    if (!email) return false;
    const configured = this.config.get<string>("ADMIN_EMAILS", "");
    return configured.split(",").some((item) => item.trim().toLowerCase() === email.toLowerCase());
  }

  private isSuperAdminAccount(account: { email?: string | null; isSuperAdmin?: boolean | null }) {
    return Boolean(account.isSuperAdmin || this.isSuperAdminEmail(account.email));
  }

  async settings() {
    return this.systemConfig.listForAdmin();
  }

  async toolHealth(toolId?: string) {
    const [translationProvider, ttsProvider] = await Promise.all([
      this.systemConfig.get("TRANSLATION_PROVIDER", "mock"),
      this.systemConfig.get("TTS_PROVIDER", "browser")
    ]);
    const selectedTranslation = translationProvider.trim().toLowerCase();
    const selectedTts = ttsProvider.trim().toLowerCase();
    const checks: Array<{
      id: string;
      label: string;
      category: string;
      provider?: string;
      active?: boolean;
      mode: "real" | "configuration" | "client";
      run: () => Promise<{ elapsedMs?: number; detail?: string; provider?: string }>;
    }> = [
      {
        id: "database",
        label: "PostgreSQL database",
        category: "Infrastructure",
        active: true,
        mode: "real",
        run: async () => {
          const startedAt = Date.now();
          await this.prisma.$queryRaw`SELECT 1`;
          return { elapsedMs: Date.now() - startedAt, detail: "Database query completed." };
        }
      },
      {
        id: "translation_aliyun_qwen",
        label: "Aliyun Qwen translation",
        category: "Translation",
        provider: "aliyun_qwen",
        active: selectedTranslation === "aliyun_qwen",
        mode: "real",
        run: () => this.translation.checkProviderHealth("aliyun_qwen")
      },
      {
        id: "translation_baidu_cloud",
        label: "Baidu Cloud translation",
        category: "Translation",
        provider: "baidu_cloud",
        active: selectedTranslation === "baidu_cloud",
        mode: "real",
        run: () => this.translation.checkProviderHealth("baidu_cloud")
      },
      {
        id: "translation_baidu",
        label: "Baidu General translation",
        category: "Translation",
        provider: "baidu",
        active: selectedTranslation === "baidu",
        mode: "real",
        run: () => this.translation.checkProviderHealth("baidu")
      },
      {
        id: "tts_doubao",
        label: "Doubao text-to-speech",
        category: "Speech",
        provider: "doubao",
        active: selectedTts === "doubao",
        mode: "real",
        run: () => this.voice.checkTtsProviderHealth("doubao")
      },
      {
        id: "tts_aliyun_bailian",
        label: "Aliyun Bailian Qwen3.5-Omni text-to-speech",
        category: "Speech",
        provider: "aliyun_bailian",
        active: selectedTts === "aliyun_bailian",
        mode: "real",
        run: () => this.voice.checkTtsProviderHealth("aliyun_bailian")
      },
      {
        id: "tts_browser",
        label: "Browser text-to-speech",
        category: "Speech",
        provider: "browser",
        active: selectedTts === "browser",
        mode: "client",
        run: () => this.voice.checkTtsProviderHealth("browser")
      },
      {
        id: "voice_transcription",
        label: "Voice transcription",
        category: "Speech",
        active: true,
        mode: "configuration",
        run: () => this.voice.checkTranscriptionProviderHealth()
      },
      {
        id: "image_ocr",
        label: "Image OCR",
        category: "AI",
        provider: "aliyun_dashscope",
        active: true,
        mode: "real",
        run: () => this.ocr.checkProviderHealth()
      },
      {
        id: "smtp",
        label: "SMTP email",
        category: "Email",
        active: true,
        mode: "real",
        run: () => this.mail.verifyConnection()
      }
    ];

    const selectedChecks = toolId ? checks.filter((check) => check.id === toolId) : checks;
    if (toolId && selectedChecks.length === 0) throw new NotFoundException("The requested integration health check was not found.");
    const tools = [];
    // Run provider probes one by one. This is not a retry: each provider is
    // called exactly once, while avoiding simultaneous TLS handshakes that can
    // make the local Wi-Fi report a healthy provider as temporarily offline.
    for (const check of selectedChecks) {
      const startedAt = Date.now();
      try {
        const result = await check.run();
        tools.push({
          id: check.id,
          label: check.label,
          category: check.category,
          provider: result.provider ?? check.provider ?? null,
          active: Boolean(check.active),
          mode: check.mode,
          status: "healthy" as const,
          elapsedMs: result.elapsedMs ?? Date.now() - startedAt,
          message: result.detail ?? "Health check passed."
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        const message = raw.replace(/Bearer\s+\S+/gi, "Bearer ******").slice(0, 500);
        tools.push({
          id: check.id,
          label: check.label,
          category: check.category,
          provider: check.provider ?? null,
          active: Boolean(check.active),
          mode: check.mode,
          status: "error" as const,
          elapsedMs: Date.now() - startedAt,
          message
        });
      }
    }
    return { checkedAt: new Date().toISOString(), tools };
  }

  async generateSlogans(rawPrompt: string) {
    const prompt = String(rawPrompt ?? "").trim();
    if (!prompt) throw new BadRequestException("Slogan generation prompt is required.");
    if (prompt.length > 1000) throw new BadRequestException("Slogan generation prompt must not exceed 1000 characters.");
    const apiKey = (await this.systemConfig.get("ALIYUN_DASHSCOPE_API_KEY", "")).trim();
    if (!apiKey) throw new BadRequestException("Slogan generation is unavailable: DashScope API Key is not configured.");
    const baseUrl = (await this.systemConfig.get("ALIYUN_DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")).trim().replace(/\/+$/, "");
    const model = (await this.systemConfig.get("ALIYUN_TRANSLATE_MODEL", "qwen3.7-plus")).trim() || "qwen3.7-plus";
    const currentSlogans = (await this.systemConfig.publicSlogans()).slogans;
    const existingReference = currentSlogans.map((item, index) => `${index + 1}. ${item.zh} | ${item.en} | ${item.hi}`).join("\n");
    const creativeDirections = [
      "短促有力、像产品宣言，避免解释性句式",
      "强调人与人之间的理解、信任和行动，不直接罗列功能",
      "使用新鲜的意象和节奏感，避免常见科技口号",
      "偏国际商务和真实协作场景，但保持温暖自然",
      "从消除语言边界后的结果出发，避免重复描述翻译本身",
      "体现可靠记录、共同事实和长期合作，但使用全新句式"
    ];
    const direction = creativeDirections[(randomBytes(1)[0] ?? 0) % creativeDirections.length] ?? creativeDirections[0]!;
    const generationId = randomBytes(6).toString("hex");
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(150_000),
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 1.05,
        top_p: 0.95,
        max_tokens: 6000,
        enable_thinking: false,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是 Glimpse Chat 的品牌文案负责人。根据管理员提示词生成恰好20条简洁、有辨识度、适合聊天软件标题栏滚动展示的标语。每条必须表达同一含义的中文、英文和印地语版本；不是逐字生硬翻译。必须主动避开参考旧标语：不能改写、同义替换或沿用其核心句式、开头、意象和高频关键词；20条之间也必须在主题切入和句式上明显不同。覆盖沟通结果、信任、协作、行动、连接、共同事实、人文温度等不同方向，不要20条都在重复“跨语言、翻译、清晰沟通”。每种语言不超过120个字符，不编号，不使用 Markdown。只返回严格 JSON：{\"slogans\":[{\"zh\":\"中文\",\"en\":\"English\",\"hi\":\"हिन्दी\"}]}。slogans 数组必须恰好20项。"
          },
          { role: "user", content: `管理员提示词：\n${prompt}\n\n本次创意方向：${direction}\n本次生成标识：${generationId}\n\n必须避开的当前已发布标语：\n${existingReference}` }
        ]
      })
    }).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new BadRequestException("Slogan generation request failed: " + reason);
    });
    const responseText = await response.text().catch(() => "");
    let payload: any = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const reason = payload?.error?.message ?? payload?.message ?? response.statusText;
      throw new BadRequestException("Slogan generation failed: " + String(reason).slice(0, 500));
    }
    const content = String(payload?.choices?.[0]?.message?.content ?? payload?.output?.text ?? payload?.text ?? "").trim();
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new BadRequestException("Slogan generator returned invalid JSON.");
    let generated: any;
    try { generated = JSON.parse(content.slice(firstBrace, lastBrace + 1)); } catch {
      throw new BadRequestException("Slogan generator returned JSON that could not be parsed.");
    }
    const rows = Array.isArray(generated?.slogans) ? generated.slogans : [];
    if (rows.length !== 20) throw new BadRequestException("Slogan generator must return exactly 20 slogans; received " + rows.length + ".");
    const slogans = rows.map((row: any, index: number) => {
      const zh = String(row?.zh ?? "").trim();
      const en = String(row?.en ?? "").trim();
      const hi = String(row?.hi ?? "").trim();
      if (!zh || !en || !hi) throw new BadRequestException("Generated slogan " + (index + 1) + " is missing Chinese, English or Hindi text.");
      if ([zh, en, hi].some((value) => value.length > 200)) throw new BadRequestException("Generated slogan " + (index + 1) + " is too long.");
      return { id: "generated-" + String(index + 1).padStart(2, "0"), zh, en, hi, enabled: true };
    });
    const seen = new Set<string>();
    for (const [index, slogan] of slogans.entries()) {
      const fingerprint = sloganFingerprint(slogan.zh + slogan.en);
      if (seen.has(fingerprint)) throw new BadRequestException(`Generated slogan ${index + 1} duplicates another generated slogan.`);
      seen.add(fingerprint);
      const tooSimilar = currentSlogans.find((existing) => Math.max(sloganSimilarity(slogan.zh, existing.zh), sloganSimilarity(slogan.en, existing.en)) >= 0.78);
      if (tooSimilar) throw new BadRequestException(`Generated slogan ${index + 1} is too similar to an existing slogan. Please regenerate with a more specific creative direction.`);
    }
    return { model, prompt, creativeDirection: direction, slogans };
  }

  async publishSlogans(rows: Array<{ id?: string; zh?: string; en?: string; hi?: string; enabled?: boolean }>, actorId: string) {
    if (!Array.isArray(rows) || rows.length < 1) throw new BadRequestException("At least one slogan is required.");
    if (rows.length > 200) throw new BadRequestException("No more than 200 slogans can be published.");
    const ids = new Set<string>();
    const slogans = rows.map((row, index) => {
      const id = String(row?.id ?? "").trim();
      const zh = String(row?.zh ?? "").trim();
      const en = String(row?.en ?? "").trim();
      const hi = String(row?.hi ?? "").trim();
      if (!id || !zh || !en || !hi) throw new BadRequestException("Slogan " + (index + 1) + " must include an ID and Chinese, English, and Hindi text.");
      if (ids.has(id)) throw new BadRequestException("Slogan IDs must be unique: " + id + ".");
      if ([id, zh, en, hi].some((value) => value.length > 200)) throw new BadRequestException("Slogan " + (index + 1) + " exceeds the 200-character limit.");
      ids.add(id);
      return { id, zh, en, hi, enabled: row.enabled !== false };
    });
    if (!slogans.some((item) => item.enabled)) throw new BadRequestException("At least one slogan must be enabled.");
    const enabledIds = slogans.filter((item) => item.enabled).map((item) => item.id);
    const settings = await this.systemConfig.updateFromAdmin([
      { key: "APP_SLOGANS_JSON", value: JSON.stringify(slogans) },
      { key: "APP_SLOGAN_ENABLED_IDS", value: JSON.stringify(enabledIds) }
    ], actorId);
    const published = await this.systemConfig.publicSlogans();
    return { ok: true, publishedAt: new Date().toISOString(), slogans, publicSlogans: published.slogans, settings };
  }

  async testSmtp(user: AuthenticatedUser, settings: Array<{ key?: string; value?: string | null }> = []) {
    const nonEmptySettings = settings.filter((item) => String(item.value ?? "").trim());
    if (nonEmptySettings.length) await this.systemConfig.updateFromAdmin(nonEmptySettings, user.id);
    // Resolve the recipient from the account record instead of trusting a
    // possibly stale token. This is the same email the user registered with.
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, nickname: true, disabledAt: true }
    });
    if (!account || account.disabledAt) throw new BadRequestException("The current administrator account is unavailable.");
    const email = account.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException("The current administrator does not have an email address.");
    try {
      const delivery = await this.mail.sendSmtpTest(email, account.nickname);
      return { ok: true, ...delivery };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`SMTP test email failed: ${reason}`);
    }
  }

  async updateSettings(items: Array<{ key?: string; value?: string | null }>, actorId: string) {
    return this.systemConfig.updateFromAdmin(items, actorId);
  }

  async admins() {
    const rows = await this.prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        phone: true,
        publicId: true,
        profilePublic: true,
        profileEmailPublic: true,
        profilePhonePublic: true,
        nickname: true,
        avatarUrl: true,
        profileCompany: true,
        profileTitle: true,
        profileLocation: true,
        profileBio: true,
        profileSignature: true,
        language: true,
        role: true,
        isSuperAdmin: true,
        adminPermissions: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return rows.map((row) => toAdminUser(row, this.isSuperAdminAccount(row)));
  }

  async createAdmin(dto: { email?: string | null; phone?: string | null; nickname?: string; password?: string; adminPermissions?: string[] }) {
    const email = cleanAdminText(dto.email)?.toLowerCase() ?? null;
    const phone = cleanAdminText(dto.phone) ?? null;
    const nickname = cleanAdminText(dto.nickname) ?? email ?? phone ?? "Admin";
    const password = String(dto.password ?? "");
    const adminPermissions = normalizeAdminPermissions(dto.adminPermissions);
    if (!email) throw new BadRequestException("Email is required for an administrator account.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Enter a valid administrator email address.");
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role === "ADMIN") throw new ConflictException("This account is already an administrator.");
      if (existing.disabledAt) throw new ConflictException("This account is disabled. Enable it before granting administrator access.");
      if (phone) {
        const phoneOwner = await this.prisma.user.findUnique({ where: { phone } });
        if (phoneOwner && phoneOwner.id !== existing.id) throw new ConflictException("The phone number belongs to another account.");
      }
      const promoted = await this.prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", adminPermissions }
      });
      return { admin: toAdminUser(promoted, this.isSuperAdminAccount(promoted)), promoted: true };
    }
    if (password.length < 8) throw new BadRequestException("Password must be at least 8 characters for a new administrator account.");
    if (phone) {
      const phoneOwner = await this.prisma.user.findUnique({ where: { phone } });
      if (phoneOwner) throw new ConflictException("The phone number belongs to another account.");
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        nickname,
        passwordHash: await argon2.hash(password, ADMIN_PASSWORD_HASH_OPTIONS),
        language: "ZH",
        role: "ADMIN",
        adminPermissions
      }
    });
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { publicId: `u_${user.id.slice(0, 18).toLowerCase()}` } });
    return { admin: toAdminUser(updated), promoted: false };
  }

  async updateAdminPermissions(userId: string, permissions: string[]) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User was not found.");
    if (this.isSuperAdminAccount(existing)) throw new ForbiddenException("Super administrator permissions cannot be changed.");
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: "ADMIN", adminPermissions: normalizeAdminPermissions(permissions) }
    });
    return toAdminUser(user, this.isSuperAdminAccount(user));
  }

  async removeAdmin(userId: string, actorId: string) {
    if (userId === actorId) throw new BadRequestException("You cannot remove your own administrator access.");
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing || existing.role !== "ADMIN") throw new NotFoundException("Administrator was not found.");
    if (this.isSuperAdminAccount(existing)) throw new ForbiddenException("A super administrator cannot be removed.");
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: "USER", adminPermissions: [] }
    });
    return { ok: true, removedAdminId: userId };
  }
}
