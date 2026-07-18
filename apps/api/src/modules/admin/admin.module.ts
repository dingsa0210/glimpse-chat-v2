import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { MailModule } from "../mail/mail.module";
import { OcrModule } from "../ocr/ocr.module";
import { TranslationModule } from "../translation/translation.module";
import { VoiceModule } from "../voice/voice.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AuthModule, ChatModule, MailModule, OcrModule, TranslationModule, VoiceModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
