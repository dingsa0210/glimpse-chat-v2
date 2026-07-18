import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CreateFeedbackDto } from "./dto/feedback.dto";
import { FeedbackService } from "./feedback.service";

@Controller("feedback")
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedbackDto) {
    return { feedback: await this.feedback.createFeedback(user.id, dto) };
  }

  @Get("me")
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return { feedback: await this.feedback.listMyFeedback(user.id) };
  }
}