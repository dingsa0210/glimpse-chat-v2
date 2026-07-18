import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { randomInt } from "node:crypto";

const CODE_TTL_SECONDS = 10 * 60;
const SEND_COOLDOWN_SECONDS = 60;
const SEND_LIMIT_PER_HOUR = 5;
const SEND_WINDOW_SECONDS = 60 * 60;

type MemoryCode = { code: string; expiresAt: number };
type MemoryCount = { count: number; expiresAt: number };

@Injectable()
export class VerificationService implements OnModuleDestroy {
  private readonly logger = new Logger(VerificationService.name);
  private redis?: Redis;
  private redisReady = false;
  private redisInit?: Promise<void>;
  private readonly memoryCodes = new Map<string, MemoryCode>();
  private readonly memoryCooldowns = new Map<string, number>();
  private readonly memoryCounts = new Map<string, MemoryCount>();

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>("REDIS_URL", "").trim();
    if (!redisUrl) return;
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redisInit = this.redis.connect().then(() => {
        this.redisReady = true;
        this.logger.log("Email verification is using Redis storage.");
      }).catch((error) => {
        this.redisReady = false;
        this.redis?.disconnect();
        this.redis = undefined;
        this.logger.warn(`Redis unavailable for email verification; falling back to memory: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }

  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  generateCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  async canSend(email: string): Promise<{ ok: true } | { ok: false; reason: "cooldown" | "limit"; retryAfterSeconds: number }> {
    await this.waitForRedis();
    const normalized = this.normalizeEmail(email);
    if (this.redisReady && this.redis) return this.redisCanSend(normalized);
    return this.memoryCanSend(normalized);
  }

  async saveCode(email: string, code: string) {
    await this.waitForRedis();
    const normalized = this.normalizeEmail(email);
    if (this.redisReady && this.redis) {
      await this.redis.set(this.codeKey(normalized), code, "EX", CODE_TTL_SECONDS);
      await this.redis.set(this.cooldownKey(normalized), "1", "EX", SEND_COOLDOWN_SECONDS);
      const count = await this.redis.incr(this.countKey(normalized));
      if (count === 1) await this.redis.expire(this.countKey(normalized), SEND_WINDOW_SECONDS);
      return;
    }
    const now = Date.now();
    this.memoryCodes.set(normalized, { code, expiresAt: now + CODE_TTL_SECONDS * 1000 });
    this.memoryCooldowns.set(normalized, now + SEND_COOLDOWN_SECONDS * 1000);
    const current = this.memoryCounts.get(normalized);
    if (!current || current.expiresAt <= now) {
      this.memoryCounts.set(normalized, { count: 1, expiresAt: now + SEND_WINDOW_SECONDS * 1000 });
    } else {
      current.count += 1;
      this.memoryCounts.set(normalized, current);
    }
  }

  async consumeCode(email: string, code: string) {
    await this.waitForRedis();
    const normalized = this.normalizeEmail(email);
    const expected = await this.getCode(normalized);
    if (!expected || expected !== code.trim()) return false;
    await this.deleteCode(normalized);
    return true;
  }

  private async getCode(email: string) {
    if (this.redisReady && this.redis) return this.redis.get(this.codeKey(email));
    const current = this.memoryCodes.get(email);
    if (!current) return null;
    if (current.expiresAt <= Date.now()) {
      this.memoryCodes.delete(email);
      return null;
    }
    return current.code;
  }

  private async deleteCode(email: string) {
    if (this.redisReady && this.redis) {
      await this.redis.del(this.codeKey(email));
      return;
    }
    this.memoryCodes.delete(email);
  }

  private async waitForRedis() {
    if (this.redisInit) await this.redisInit;
  }

  private async redisCanSend(email: string): Promise<{ ok: true } | { ok: false; reason: "cooldown" | "limit"; retryAfterSeconds: number }> {
    if (!this.redis) return this.memoryCanSend(email);
    const cooldown = await this.redis.ttl(this.cooldownKey(email));
    if (cooldown > 0) return { ok: false, reason: "cooldown", retryAfterSeconds: cooldown };
    const count = Number(await this.redis.get(this.countKey(email)) ?? "0");
    if (count >= SEND_LIMIT_PER_HOUR) {
      const ttl = await this.redis.ttl(this.countKey(email));
      return { ok: false, reason: "limit", retryAfterSeconds: Math.max(ttl, SEND_COOLDOWN_SECONDS) };
    }
    return { ok: true };
  }

  private memoryCanSend(email: string): { ok: true } | { ok: false; reason: "cooldown" | "limit"; retryAfterSeconds: number } {
    const now = Date.now();
    const cooldownUntil = this.memoryCooldowns.get(email) ?? 0;
    if (cooldownUntil > now) return { ok: false, reason: "cooldown", retryAfterSeconds: Math.ceil((cooldownUntil - now) / 1000) };
    const current = this.memoryCounts.get(email);
    if (current && current.expiresAt > now && current.count >= SEND_LIMIT_PER_HOUR) return { ok: false, reason: "limit", retryAfterSeconds: Math.ceil((current.expiresAt - now) / 1000) };
    return { ok: true };
  }

  private codeKey(email: string) { return `verify:code:${email}`; }
  private cooldownKey(email: string) { return `verify:cooldown:${email}`; }
  private countKey(email: string) { return `verify:count:${email}`; }
}
