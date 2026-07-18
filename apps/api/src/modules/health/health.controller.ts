import { GLIMPSE_CHAT_VERSION } from "@glimpse/shared";
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return this.live();
  }

  @Get("live")
  live() {
    return {
      ok: true,
      service: "glimpse-api",
      version: GLIMPSE_CHAT_VERSION,
      status: "live",
      timestamp: new Date().toISOString()
    };
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        ok: true,
        service: "glimpse-api",
        version: GLIMPSE_CHAT_VERSION,
        status: "ready",
        checks: {
          database: "ok"
        },
        timestamp: new Date().toISOString()
      };
    } catch {
      throw new ServiceUnavailableException({
        ok: false,
        service: "glimpse-api",
        version: GLIMPSE_CHAT_VERSION,
        status: "not_ready",
        checks: {
          database: "error"
        },
        timestamp: new Date().toISOString()
      });
    }
  }
}