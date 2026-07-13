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
  async overview(@CurrentUser() user: AuthenticatedUser) {
    this.admin.assertPermission(user, "overview");
    return { overview: await this.admin.overview() };
  }

  @Get("users")
  async users(@CurrentUser() user: AuthenticatedUser, @Query("query") query = "") {
    this.admin.assertPermission(user, "users");
    return { users: await this.admin.users(query) };
  }

  @Get("settings")
  async settings(@CurrentUser() user: AuthenticatedUser) {
    this.admin.assertPermission(user, "settings");
    return { settings: await this.admin.settings() };
  }

  @Post("settings")
  async updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: { settings?: Array<{ key?: string; value?: string | null }> }) {
    this.admin.assertPermission(user, "settings");
    return { settings: await this.admin.updateSettings(body.settings ?? [], user.id) };
  }

  @Get("admins")
  async admins(@CurrentUser() user: AuthenticatedUser) {
    this.admin.assertPermission(user, "admins");
    return { admins: await this.admin.admins() };
  }

  @Post("admins")
  async createAdmin(@CurrentUser() user: AuthenticatedUser, @Body() body: { email?: string | null; phone?: string | null; nickname?: string; password?: string; adminPermissions?: string[] }) {
    this.admin.assertPermission(user, "admins");
    return { admin: await this.admin.createAdmin(body) };
  }

  @Post("admins/:userId/permissions")
  async updateAdminPermissions(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string, @Body() body: { adminPermissions?: string[] }) {
    this.admin.assertPermission(user, "admins");
    return { admin: await this.admin.updateAdminPermissions(userId, body.adminPermissions ?? []) };
  }

  @Get("feedback")
  async feedback(@CurrentUser() user: AuthenticatedUser) {
    this.admin.assertPermission(user, "feedback");
    return { feedback: await this.admin.feedback() };
  }

  @Post("feedback/:feedbackId/status")
  async updateFeedbackStatus(@CurrentUser() user: AuthenticatedUser, @Param("feedbackId") feedbackId: string, @Body() body: { status?: string }) {
    this.admin.assertPermission(user, "feedback");
    return { feedback: await this.admin.updateFeedbackStatus(feedbackId, body.status ?? "") };
  }

  @Get("conversations")
  async conversations(@CurrentUser() user: AuthenticatedUser) {
    this.admin.assertPermission(user, "conversations");
    return { conversations: await this.admin.conversations() };
  }

  @Get("users/:userId/chats")
  async userChats(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    this.admin.assertPermission(user, "user_chats");
    return await this.admin.userChats(userId);
  }

  @Post("users/:userId/reset-password")
  async resetUserPassword(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    this.admin.assertPermission(user, "users");
    return await this.admin.resetUserPassword(userId, user.id);
  }

  @Post("users/:userId/disable")
  async disableUser(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    this.admin.assertPermission(user, "users");
    return { user: await this.admin.setUserDisabled(userId, true, user.id) };
  }

  @Post("users/:userId/enable")
  async enableUser(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    this.admin.assertPermission(user, "users");
    return { user: await this.admin.setUserDisabled(userId, false, user.id) };
  }
}
