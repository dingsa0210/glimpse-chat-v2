import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
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

  @Post("settings/smtp-test")
  async testSmtp(@CurrentUser() user: AuthenticatedUser, @Body() body: { settings?: Array<{ key?: string; value?: string | null }> }) {
    this.admin.assertPermission(user, "settings");
    return this.admin.testSmtp(user, body.settings ?? []);
  }

  @Get("tools/health")
  async toolHealth(@CurrentUser() user: AuthenticatedUser) {
    try {
      this.admin.assertPermission(user, "overview");
    } catch {
      this.admin.assertPermission(user, "settings");
    }
    return this.admin.toolHealth();
  }

  @Post("tools/health/:toolId")
  async retestToolHealth(@CurrentUser() user: AuthenticatedUser, @Param("toolId") toolId: string) {
    try {
      this.admin.assertPermission(user, "overview");
    } catch {
      this.admin.assertPermission(user, "settings");
    }
    return this.admin.toolHealth(toolId);
  }

  @Post("slogans/generate")
  async generateSlogans(@CurrentUser() user: AuthenticatedUser, @Body() body: { prompt?: string }) {
    this.admin.assertPermission(user, "settings");
    return this.admin.generateSlogans(body.prompt ?? "");
  }

  @Post("slogans/publish")
  async publishSlogans(@CurrentUser() user: AuthenticatedUser, @Body() body: { slogans?: Array<{ id?: string; zh?: string; en?: string; hi?: string; enabled?: boolean }> }) {
    this.admin.assertPermission(user, "settings");
    return this.admin.publishSlogans(body.slogans ?? [], user.id);
  }

  @Get("admins")
  async admins(@CurrentUser() user: AuthenticatedUser) {
    this.admin.assertPermission(user, "admins");
    return { admins: await this.admin.admins() };
  }

  @Post("admins")
  async createAdmin(@CurrentUser() user: AuthenticatedUser, @Body() body: { email?: string | null; phone?: string | null; nickname?: string; password?: string; adminPermissions?: string[] }) {
    this.admin.assertPermission(user, "admins");
    return await this.admin.createAdmin(body);
  }

  @Post("admins/:userId/permissions")
  async updateAdminPermissions(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string, @Body() body: { adminPermissions?: string[] }) {
    this.admin.assertPermission(user, "admins");
    return { admin: await this.admin.updateAdminPermissions(userId, body.adminPermissions ?? []) };
  }

  @Delete("admins/:userId")
  async removeAdmin(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    this.admin.assertPermission(user, "admins");
    this.admin.assertSuperAdmin(user);
    return await this.admin.removeAdmin(userId, user.id);
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
