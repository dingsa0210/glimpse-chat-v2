import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TranslationModule } from "../translation/translation.module";
import { ChatGateway } from "./chat.gateway";
import { ChatStorageService } from "./chat-storage.service";

@Module({
  imports: [AuthModule, TranslationModule],
  providers: [ChatGateway, ChatStorageService],
  exports: [ChatStorageService]
})
export class ChatModule {}