import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  async overview() {
    return { overview: await this.admin.overview() };
  }

  @Get("users")
  async users() {
    return { users: await this.admin.users() };
  }



  @Get("feedback")
  async feedback() {
    return { feedback: await this.admin.feedback() };
  }

  @Post("feedback/:feedbackId/status")
  async updateFeedbackStatus(@Param("feedbackId") feedbackId: string, @Body() body: { status?: string }) {
    return { feedback: await this.admin.updateFeedbackStatus(feedbackId, body.status ?? "") };
  }
  @Get("conversations")
  async conversations() {
    return { conversations: await this.admin.conversations() };
  }
  @Get("users/:userId/chats")
  async userChats(@Param("userId") userId: string) {
    return await this.admin.userChats(userId);
  }

  @Post("users/:userId/reset-password")
  async resetUserPassword(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return await this.admin.resetUserPassword(userId, user.id);
  }
  @Post("users/:userId/disable")
  async disableUser(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return { user: await this.admin.setUserDisabled(userId, true, user.id) };
  }

  @Post("users/:userId/enable")
  async enableUser(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return { user: await this.admin.setUserDisabled(userId, false, user.id) };
  }
}




