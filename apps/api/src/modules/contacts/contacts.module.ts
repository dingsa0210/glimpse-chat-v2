import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TranslationModule } from "../translation/translation.module";
import { MediaModule } from "../media/media.module";
import { VoiceModule } from "../voice/voice.module";
import { ChatModule } from "../chat/chat.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [AuthModule, PrismaModule, ChatModule, TranslationModule, MediaModule, VoiceModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService]
})
export class ContactsModule {}
