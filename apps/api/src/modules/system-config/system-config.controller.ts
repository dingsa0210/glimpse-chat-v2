import { Controller, Get } from "@nestjs/common";
import { SystemConfigService } from "./system-config.service";

@Controller("system")
export class SystemConfigController {
  constructor(private readonly systemConfig: SystemConfigService) {}

  @Get("slogans")
  async slogans() {
    return this.systemConfig.publicSlogans();
  }
}