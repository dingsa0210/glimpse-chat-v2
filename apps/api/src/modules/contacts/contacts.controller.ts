import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { randomUUID } from "node:crypto";
import { BadRequestException, Put } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ChatStorageService } from "../chat/chat-storage.service";
import { ChatGateway } from "../chat/chat.gateway";
import { TranslationService } from "../translation/translation.service";
import { MediaService } from "../media/media.service";
import { VoiceTranscriptionService } from "../voice/voice-transcription.service";
import { ContactsService } from "./contacts.service";
import { CreateDirectConversationDto, CreateFriendRequestDto, CreateGroupConversationDto, EditTranslationDto, InviteGroupMembersDto, TranslateMessageDto, UpdateContactMemoDto, UpdateContactTagsDto, UpdateGroupProfileDto } from "./dto/contacts.dto";
@Controller()
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly chatStorage: ChatStorageService,
    private readonly chatGateway: ChatGateway,
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
  @Get("contacts/tags")
  async contactTags(@CurrentUser() user: AuthenticatedUser) {
    return { tags: await this.contacts.listContactTags(user.id) };
  }

  @Post("contacts/:contactUserId/tags")
  async updateContactTags(@CurrentUser() user: AuthenticatedUser, @Param("contactUserId") contactUserId: string, @Body() dto: { tags?: string[] | string }) {
    return { tags: await this.contacts.updateContactTags(user.id, contactUserId, dto.tags) };
  }

  @Put("contacts/:contactUserId/tags")
  async updateContactTagsPut(@CurrentUser() user: AuthenticatedUser, @Param("contactUserId") contactUserId: string, @Body() dto: UpdateContactTagsDto) {
    return { tags: await this.contacts.updateContactTags(user.id, contactUserId, dto.tags) };
  }

  @Get("contacts/memos")
  async contactMemos(@CurrentUser() user: AuthenticatedUser) {
    return { memos: await this.contacts.listContactMemos(user.id) };
  }

  @Put("contacts/:contactUserId/memo")
  async updateContactMemo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("contactUserId") contactUserId: string,
    @Body() dto: UpdateContactMemoDto
  ) {
    return { memo: await this.contacts.updateContactMemo(user.id, contactUserId, dto.body, dto.images) };
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
    return this.chatStorage.translateMessage(conversationId, messageId, user.id, dto.targetLanguage, this.translation);
  }
  @Patch('conversations/:conversationId/messages/:messageId/translation')
  async editTranslation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditTranslationDto
  ) {
    const editedBody = typeof dto.body === 'string' && dto.body.trim() ? dto.body : typeof dto.editedBody === 'string' ? dto.editedBody : '';
    const message = await this.chatStorage.editTranslation(conversationId, messageId, user.id, user.nickname, dto.targetLanguage, editedBody, this.translation);
    const notice = await this.chatStorage.saveMessage({
      id: randomUUID(),
      conversationId,
      senderId: user.id,
      senderName: user.nickname,
      type: "text",
      body: `glimpse-translation-edit-notice:v1:${JSON.stringify({ editorName: user.nickname, targetMessageId: message.id })}`,
      replyToMessageId: message.id,
      replyToMessageSenderName: message.senderName,
      replyToMessageType: message.type,
      replyToMessageBody: message.body?.slice(0, 240),
      createdAt: new Date().toISOString()
    }, user.id);
    this.chatGateway.translationUpdated(message);
    this.chatGateway.publishMessage(notice);
    return {
      message,
      notice
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

  @Delete("conversations/:conversationId/members/:userId")
  async removeGroupMember(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string, @Param("userId") userId: string) {
    const result = await this.contacts.removeGroupMember(user.id, conversationId, userId);
    this.chatGateway.removeUserFromConversation(conversationId, userId, user.id, result.members.length);
    return result;
  }

  @Patch("conversations/:conversationId/members/:userId/admin")
  async setGroupMemberAdmin(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string, @Param("userId") userId: string, @Body() dto: { isAdmin?: boolean }) {
    if (typeof dto.isAdmin !== "boolean") throw new BadRequestException("isAdmin must be a boolean.");
    const result = await this.contacts.setGroupMemberAdmin(user.id, conversationId, userId, dto.isAdmin);
    this.chatGateway.groupMemberAdminChanged(conversationId, userId, dto.isAdmin, user.id);
    return result;
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
