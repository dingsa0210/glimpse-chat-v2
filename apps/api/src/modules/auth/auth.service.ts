import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { VerificationService } from "../verification/verification.service";
import type { AccessTokenPayload, AuthenticatedUser } from "./auth.types";
import type { ChangePasswordDto, LoginDto, RegisterDto, SendCodeDto, UpdateProfileDto } from "./dto/auth.dto";


const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const PUBLIC_ID_CHANGE_INTERVAL_MS = 183 * 24 * 60 * 60 * 1000;
const PUBLIC_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;

type LoginFailureState = {
  count: number;
  lockedUntil?: number;
};

const PASSWORD_HASH_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
};
function parseAdminEmails(value: string) {
  return new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

function toRole(value: string, email: string | null | undefined, adminEmails: Set<string>): "user" | "admin" {
  if (email && adminEmails.has(email.toLowerCase())) return "admin";
  return value.toUpperCase() === "ADMIN" ? "admin" : "user";
}

function toLanguage(value: string): "zh" | "en" {
  return value.toLowerCase() === "en" ? "en" : "zh";
}
function cleanOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toAuthenticatedUser(user: {
  id: string;
  email: string | null;
  phone: string | null;
  publicId: string | null;
  publicIdUpdatedAt: Date | null;
  profilePublic: boolean;
  profileEmailPublic: boolean;
  profilePhonePublic: boolean;
  nickname: string;
  avatarUrl: string | null;
  profileCompany: string | null;
  profileTitle: string | null;
  profileLocation: string | null;
  profileBio: string | null;
  profileSignature: string | null;
  language: string;
  role: string;
}, adminEmails: Set<string>): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    publicId: user.publicId,
    publicIdUpdatedAt: user.publicIdUpdatedAt?.toISOString() ?? null,
    profilePublic: user.profilePublic,
    profileEmailPublic: user.profileEmailPublic,
    profilePhonePublic: user.profilePhonePublic,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    company: user.profileCompany,
    title: user.profileTitle,
    location: user.profileLocation,
    bio: user.profileBio,
    signature: user.profileSignature,
    language: toLanguage(user.language),
    role: toRole(user.role, user.email, adminEmails)
  };
}

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, LoginFailureState>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly verification: VerificationService
  ) {}

  async sendVerificationCode(dto: SendCodeDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email is already registered.");

    const canSend = await this.verification.canSend(email);
    if (!canSend.allowed) {
      throw new HttpException(
        `Please wait ${canSend.retryAfterSeconds ?? 60} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const code = this.verification.generateCode();
    await this.verification.saveCode(email, code);
    await this.mail.sendVerificationCode(email, code);

    return { ok: true };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const codeValid = await this.verification.verifyCode(email, dto.code);
    if (!codeValid) {
      throw new BadRequestException("Invalid or expired verification code.");
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email is already registered.");

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(dto.password, PASSWORD_HASH_OPTIONS),
        nickname: dto.nickname.trim(),
        language: (dto.language ?? "en").toUpperCase() as "ZH" | "EN",
        role: parseAdminEmails(this.config.get<string>("ADMIN_EMAILS", "")).has(email) ? "ADMIN" : "USER"
      }
    });

    const userWithPublicId = await this.prisma.user.update({
      where: { id: user.id },
      data: { publicId: `u_${user.id.slice(0, 18).toLowerCase()}` },
    });

    return this.authResponse(toAuthenticatedUser(userWithPublicId, parseAdminEmails(this.config.get<string>("ADMIN_EMAILS", ""))));
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    this.assertLoginAllowed(email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.disabledAt || !(await argon2.verify(user.passwordHash, dto.password))) {
      this.recordLoginFailure(email);
      throw new UnauthorizedException("Invalid email or password.");
    }
    this.clearLoginFailures(email);

    return this.authResponse(toAuthenticatedUser(user, parseAdminEmails(this.config.get<string>("ADMIN_EMAILS", ""))));
  }



  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new UnauthorizedException("Invalid or expired token.");
    const data: Record<string, unknown> = {
      ...(dto.nickname !== undefined ? { nickname: dto.nickname.trim() } : {}),
      ...(dto.avatarUrl !== undefined ? { avatarUrl: cleanOptionalText(dto.avatarUrl) } : {}),
      ...(dto.company !== undefined ? { profileCompany: cleanOptionalText(dto.company) } : {}),
      ...(dto.title !== undefined ? { profileTitle: cleanOptionalText(dto.title) } : {}),
      ...(dto.location !== undefined ? { profileLocation: cleanOptionalText(dto.location) } : {}),
      ...(dto.bio !== undefined ? { profileBio: cleanOptionalText(dto.bio) } : {}),
      ...(dto.signature !== undefined ? { profileSignature: cleanOptionalText(dto.signature) } : {}),
      ...(dto.profilePublic !== undefined ? { profilePublic: dto.profilePublic } : {}),
      ...(dto.profileEmailPublic !== undefined ? { profileEmailPublic: dto.profileEmailPublic } : {}),
      ...(dto.profilePhonePublic !== undefined ? { profilePhonePublic: dto.profilePhonePublic } : {})
    };
    if (dto.publicId !== undefined) {
      const nextPublicId = dto.publicId.trim().toLowerCase();
      if (!PUBLIC_ID_PATTERN.test(nextPublicId)) throw new BadRequestException("ID must be 3-32 characters and can only contain letters, numbers, dot, underscore, or hyphen.");
      if (nextPublicId !== current.publicId) {
        if (current.publicIdUpdatedAt && Date.now() - current.publicIdUpdatedAt.getTime() < PUBLIC_ID_CHANGE_INTERVAL_MS) {
          throw new BadRequestException("ID can only be changed once every 6 months.");
        }
        const existing = await this.prisma.user.findUnique({ where: { publicId: nextPublicId } });
        if (existing && existing.id !== userId) throw new ConflictException("ID is already in use.");
        data.publicId = nextPublicId;
        data.publicIdUpdatedAt = new Date();
      }
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return this.authResponse(toAuthenticatedUser(user, parseAdminEmails(this.config.get<string>("ADMIN_EMAILS", ""))));
  }
  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException("New password must be different from the current password.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException("Current password is incorrect.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword, PASSWORD_HASH_OPTIONS) }
    });

    return { ok: true };
  }
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET", "dev_access_secret_change_me")
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, phone: true, publicId: true, publicIdUpdatedAt: true, profilePublic: true, profileEmailPublic: true, profilePhonePublic: true, nickname: true, avatarUrl: true, profileCompany: true, profileTitle: true, profileLocation: true, profileBio: true, profileSignature: true, language: true, role: true, disabledAt: true }
      });
      if (!user || user.disabledAt) throw new UnauthorizedException("Account is disabled.");
      return toAuthenticatedUser(user, parseAdminEmails(this.config.get<string>("ADMIN_EMAILS", "")));
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }

  private assertLoginAllowed(email: string) {
    const state = this.loginFailures.get(email);
    if (!state?.lockedUntil) return;
    if (state.lockedUntil <= Date.now()) {
      this.loginFailures.delete(email);
      return;
    }
    throw new HttpException("Too many failed login attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }

  private recordLoginFailure(email: string) {
    const current = this.loginFailures.get(email);
    const count = (current?.count ?? 0) + 1;
    this.loginFailures.set(email, {
      count,
      lockedUntil: count >= LOGIN_FAILURE_LIMIT ? Date.now() + LOGIN_LOCK_MS : undefined
    });
  }

  private clearLoginFailures(email: string) {
    this.loginFailures.delete(email);
  }
  private async authResponse(user: AuthenticatedUser) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      publicId: user.publicId,
      publicIdUpdatedAt: user.publicIdUpdatedAt,
      profilePublic: user.profilePublic,
      profileEmailPublic: user.profileEmailPublic,
      profilePhonePublic: user.profilePhonePublic,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      company: user.company,
      title: user.title,
      location: user.location,
      bio: user.bio,
      signature: user.signature,
      language: user.language,
      role: user.role
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET", "dev_access_secret_change_me"),
      expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "7d")
    });
    return { accessToken, user };
  }
}


