import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TranslationModule } from "../translation/translation.module";
import { MediaModule } from "../media/media.module";
import { ChatGateway } from "./chat.gateway";
import { ChatStorageService } from "./chat-storage.service";

@Module({
  imports: [AuthModule, TranslationModule, MediaModule],
  providers: [ChatGateway, ChatStorageService],
  exports: [ChatStorageService, ChatGateway]
})
export class ChatModule {}
