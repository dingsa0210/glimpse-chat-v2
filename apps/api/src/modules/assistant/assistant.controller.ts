import { BadRequestException, Body, Controller, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AssistantService, type AssistantInput } from "./assistant.service";

@Controller("assistant")
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}
  @Post("chat")
  chat(@CurrentUser() user: AuthenticatedUser, @Body() body: AssistantInput) {
    if (!user?.id) throw new BadRequestException("A signed-in user is required.");
    return this.assistant.chat(user.id, body);
  }

  @Post("documents/:fileName/translate")
  translateDocument(@CurrentUser() user: AuthenticatedUser, @Param("fileName") fileName: string, @Query("name") name: string | undefined, @Body() body: { targetLanguage?: unknown }) {
    if (!user?.id) throw new BadRequestException("A signed-in user is required.");
    return this.assistant.translateStoredDocument(user.id, fileName, name, body?.targetLanguage);
  }
}
