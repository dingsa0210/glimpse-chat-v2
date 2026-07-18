import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { SystemConfigModule } from "../system-config/system-config.module";

@Module({
  imports: [SystemConfigModule],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
