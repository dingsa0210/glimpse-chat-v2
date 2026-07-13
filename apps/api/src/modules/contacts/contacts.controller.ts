import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ChatStorageService } from "../chat/chat-storage.service";
import { TranslationService } from "../translation/translation.service";
import { MediaService } from "../media/media.service";
import { VoiceTranscriptionService } from "../voice/voice-transcription.service";
import { ContactsService } from "./contacts.service";
import { CreateDirectConversationDto, CreateFriendRequestDto, CreateGroupConversationDto, InviteGroupMembersDto, TranslateMessageDto, UpdateGroupProfileDto } from "./dto/contacts.dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly chatStorage: ChatStorageService,
    private readonly translation: TranslationService,
    private readonly media: MediaService,
    private readonly voice: VoiceTranscriptionService
  ) {}

  @Get("search/global")
  async globalSearch(@CurrentUser() user: AuthenticatedUser, @Query("q") query = "") {
    return this.contacts.globalSearch(user.id, query);
  }

  @Get("contacts/search")
  async search(@CurrentUser() user: AuthenticatedUser, @Query("q") query = "") {
    return { users: await this.contacts.searchUsers(user.id, query) };
  }


  @Post("contacts/friend-requests")
  async sendFriendRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFriendRequestDto) {
    return { request: await this.contacts.sendFriendRequest(user.id, dto.userId) };
  }

  @Get("contacts/friend-requests")
  async friendRequests(@CurrentUser() user: AuthenticatedUser) {
    return { requests: await this.contacts.listFriendRequests(user.id) };
  }

  @Post("contacts/friend-requests/:requestId/accept")
  async acceptFriendRequest(@CurrentUser() user: AuthenticatedUser, @Param("requestId") requestId: string) {
    return { request: await this.contacts.respondToFriendRequest(user.id, requestId, true) };
  }

  @Post("contacts/friend-requests/:requestId/reject")
  async rejectFriendRequest(@CurrentUser() user: AuthenticatedUser, @Param("requestId") requestId: string) {
    return { request: await this.contacts.respondToFriendRequest(user.id, requestId, false) };
  }



  @Post("contacts/blocks")
  async blockUser(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFriendRequestDto) {
    return { block: await this.contacts.blockUser(user.id, dto.userId) };
  }

  @Get("contacts/blocks")
  async blockedUsers(@CurrentUser() user: AuthenticatedUser) {
    return { blocks: await this.contacts.listBlockedUsers(user.id) };
  }

  @Delete("contacts/blocks/:blockedUserId")
  async unblockUser(@CurrentUser() user: AuthenticatedUser, @Param("blockedUserId") blockedUserId: string) {
    return this.contacts.unblockUser(user.id, blockedUserId);
  }
  @Delete("contacts/friends/:friendUserId")
  async removeFriend(@CurrentUser() user: AuthenticatedUser, @Param("friendUserId") friendUserId: string) {
    return this.contacts.removeFriend(user.id, friendUserId);
  }
  @Post("contacts/friends")
  async saveContact(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFriendRequestDto) {
    return { friend: await this.contacts.saveContact(user.id, dto.userId) };
  }

  @Get("contacts/friends")
  async friends(@CurrentUser() user: AuthenticatedUser) {
    return { friends: await this.contacts.listFriends(user.id) };
  }
  @Get("conversations")
  async conversations(@CurrentUser() user: AuthenticatedUser) {
    return { conversations: await this.contacts.listConversations(user.id) };
  }

  @Get("conversations/:conversationId/messages")
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Query("before") before?: string,
    @Query("limit") limit?: string
  ) {
    return this.chatStorage.getHistoryPage(conversationId, user.id, {
      before,
      limit: limit ? Number(limit) : undefined
    });
  }

  @Post("conversations/:conversationId/read")
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string) {
    const readAt = await this.chatStorage.markConversationRead(conversationId, user.id);
    return { ok: true, readAt: readAt.toISOString() };
  }


  @Post("conversations/:conversationId/messages/:messageId/translate")
  async translateMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() dto: TranslateMessageDto
  ) {
    return {
      message: await this.chatStorage.translateMessage(conversationId, messageId, user.id, dto.targetLanguage, this.translation)
    };
  }
  @Post("conversations/:conversationId/messages/:messageId/transcribe")
  async transcribeVoiceMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() dto: TranslateMessageDto
  ) {
    return { message: await this.chatStorage.transcribeVoiceMessage(conversationId, messageId, user.id, dto.targetLanguage, this.media, this.voice) };
  }
  @Get("conversations/:conversationId/members")
  async groupMembers(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string) {
    return { members: await this.contacts.listGroupMembers(user.id, conversationId) };
  }

  @Post("conversations/:conversationId/members")
  async inviteGroupMembers(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string, @Body() dto: InviteGroupMembersDto) {
    return await this.contacts.inviteGroupMembers(user.id, conversationId, dto.userIds);
  }

  @Patch("conversations/:conversationId/group-profile")
  async updateGroupProfile(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string, @Body() dto: UpdateGroupProfileDto) {
    return { conversation: await this.contacts.updateGroupProfile(user.id, conversationId, dto) };
  }

  @Delete("conversations/:conversationId/group")
  async dissolveGroup(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string) {
    return await this.contacts.dissolveGroup(user.id, conversationId);
  }
  @Post("conversations/group")
  async createGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupConversationDto) {
    return { conversation: await this.contacts.createGroupConversation(user.id, dto.title, dto.userIds) };
  }
  @Post("conversations/direct")
  async createDirect(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDirectConversationDto) {
    return { conversation: await this.contacts.createDirectConversation(user.id, dto.userId) };
  }
}






