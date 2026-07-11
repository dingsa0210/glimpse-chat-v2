import crypto from "node:crypto";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

const CODE_TTL_SECONDS = 10 * 60;        // 验证码 10 分钟过期
const CODE_LENGTH = 6;                    // 6 位数字
const SEND_COOLDOWN_SECONDS = 60;         // 同一邮箱 60 秒内不可重发
const SEND_LIMIT_PER_HOUR = 5;            // 同一邮箱每小时最多发送 5 次

interface CodeEntry { code: string; createdAt: number; }
interface RateEntry { count: number; windowStart: number; lastSentAt: number; }

@Injectable()
export class VerificationService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private readonly logger = new Logger(VerificationService.name);

  // 内存 fallback（当 Redis 不可用时）
  private readonly codes = new Map<string, CodeEntry>();
  private readonly rates = new Map<string, RateEntry>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.config.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.logger.warn("REDIS_URL not configured — using in-memory fallback.");
      return;
    }
    try {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      await this.redis.connect();
      this.logger.log("Redis connected for verification codes.");
    } catch {
      this.logger.warn("Redis unavailable — using in-memory fallback.");
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  /** 生成 6 位随机数字验证码 */
  generateCode(): string {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const value = (buffer[0] ?? 0) % 1_000_000;
    return String(value).padStart(CODE_LENGTH, "0");
  }

  /** 检查是否可以发送验证码（频率限制） */
  async canSend(email: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    if (this.redis) return this.redisCanSend(email);
    return this.memoryCanSend(email);
  }

  /** 保存验证码并设置频率限制 */
  async saveCode(email: string, code: string): Promise<void> {
    if (this.redis) {
      await this.redisSaveCode(email, code);
      return;
    }
    this.memorySaveCode(email, code);
  }

  /** 校验验证码，校验成功后删除 */
  async verifyCode(email: string, code: string): Promise<boolean> {
    if (this.redis) return this.redisVerifyCode(email, code);
    return this.memoryVerifyCode(email, code);
  }

  // ---------- Redis ----------

  private async redisCanSend(email: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const cooldownKey = `verify:cooldown:${email}`;
    const countKey = `verify:count:${email}`;
    const cooldownTtl = await this.redis!.ttl(cooldownKey);
    if (cooldownTtl > 0) return { allowed: false, retryAfterSeconds: cooldownTtl };
    const count = parseInt(await this.redis!.get(countKey) || "0", 10);
    if (count >= SEND_LIMIT_PER_HOUR) {
      const countTtl = await this.redis!.ttl(countKey);
      return { allowed: false, retryAfterSeconds: Math.max(countTtl, 1) };
    }
    return { allowed: true };
  }

  private async redisSaveCode(email: string, code: string): Promise<void> {
    const codeKey = `verify:code:${email}`;
    const cooldownKey = `verify:cooldown:${email}`;
    const countKey = `verify:count:${email}`;
    await this.redis!.set(codeKey, code, "EX", CODE_TTL_SECONDS);
    await this.redis!.set(cooldownKey, "1", "EX", SEND_COOLDOWN_SECONDS);
    const newCount = await this.redis!.incr(countKey);
    if (newCount === 1) await this.redis!.expire(countKey, 3600);
  }

  private async redisVerifyCode(email: string, code: string): Promise<boolean> {
    const codeKey = `verify:code:${email}`;
    const stored = await this.redis!.get(codeKey);
    if (!stored || stored !== code) return false;
    await this.redis!.del(codeKey);
    return true;
  }

  // ---------- 内存 fallback ----------

  private memoryCanSend(email: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const rate = this.rates.get(email);
    if (!rate) return { allowed: true };

    const cooldownRemaining = Math.ceil((rate.lastSentAt + SEND_COOLDOWN_SECONDS * 1000 - now) / 1000);
    if (cooldownRemaining > 0) return { allowed: false, retryAfterSeconds: cooldownRemaining };

    if (now - rate.windowStart < 3600_000 && rate.count >= SEND_LIMIT_PER_HOUR) {
      const remaining = Math.ceil((rate.windowStart + 3600_000 - now) / 1000);
      return { allowed: false, retryAfterSeconds: Math.max(remaining, 1) };
    }
    return { allowed: true };
  }

  private memorySaveCode(email: string, code: string): void {
    const now = Date.now();
    this.codes.set(email, { code, createdAt: now });

    const existing = this.rates.get(email);
    if (!existing || now - existing.windowStart >= 3600_000) {
      this.rates.set(email, { count: 1, windowStart: now, lastSentAt: now });
    } else {
      existing.count += 1;
      existing.lastSentAt = now;
    }
  }

  private memoryVerifyCode(email: string, code: string): boolean {
    const entry = this.codes.get(email);
    if (!entry) return false;
    if (Date.now() - entry.createdAt > CODE_TTL_SECONDS * 1000) {
      this.codes.delete(email);
      return false;
    }
    if (entry.code !== code) return false;
    this.codes.delete(email);
    return true;
  }
}
