import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import * as argon2 from "argon2";
import { ADMIN_PERMISSION_OPTIONS } from "@glimpse/shared";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";

type AdminPermissionCode = (typeof ADMIN_PERMISSION_OPTIONS)[number]["code"];
const VALID_ADMIN_PERMISSION_CODES = new Set<string>(ADMIN_PERMISSION_OPTIONS.map((item) => item.code));

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
  adminPermissions?: string[];
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
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
    role: row.role.toLowerCase(),
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
  constructor(private readonly prisma: PrismaService, private readonly systemConfig: SystemConfigService) {}

  async overview() {
    const [users, disabledUsers, conversations, messages, openFeedback] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { disabledAt: { not: null } } }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.feedback.count({ where: { status: "OPEN" } })
    ]);
    return { users, disabledUsers, conversations, messages, openFeedback };
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
        adminPermissions: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return rows.map(toAdminUser);
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

  async settings() {
    return this.systemConfig.listForAdmin();
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
        adminPermissions: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return rows.map(toAdminUser);
  }

  async createAdmin(dto: { email?: string | null; phone?: string | null; nickname?: string; password?: string; adminPermissions?: string[] }) {
    const email = cleanAdminText(dto.email)?.toLowerCase() ?? null;
    const phone = cleanAdminText(dto.phone) ?? null;
    const nickname = cleanAdminText(dto.nickname) ?? email ?? phone ?? "Admin";
    const password = String(dto.password ?? "");
    if (!email && !phone) throw new BadRequestException("Email or phone is required.");
    if (password.length < 8) throw new BadRequestException("Password must be at least 8 characters.");
    const existing = await this.prisma.user.findFirst({ where: { OR: [email ? { email } : undefined, phone ? { phone } : undefined].filter(Boolean) as Prisma.UserWhereInput[] } });
    if (existing) throw new ConflictException("Account already exists.");
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        nickname,
        passwordHash: await argon2.hash(password, ADMIN_PASSWORD_HASH_OPTIONS),
        language: "ZH",
        role: "ADMIN",
        adminPermissions: normalizeAdminPermissions(dto.adminPermissions)
      }
    });
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { publicId: `u_${user.id.slice(0, 18).toLowerCase()}` } });
    return toAdminUser(updated);
  }

  async updateAdminPermissions(userId: string, permissions: string[]) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User was not found.");
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: "ADMIN", adminPermissions: normalizeAdminPermissions(permissions) }
    });
    return toAdminUser(user);
  }
}
