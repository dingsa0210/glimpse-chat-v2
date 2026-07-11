import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ConversationSummary, GroupMemberSummary, PublicUser } from "@glimpse/shared";
import type { Conversation } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

function directConversationId(userA: string, userB: string) {
  return `direct:${[userA, userB].sort().join(":")}`;
}

function toPublicUser(user: { id: string; email: string | null; phone: string | null; publicId?: string | null; profilePublic?: boolean | null; profileEmailPublic?: boolean | null; profilePhonePublic?: boolean | null; nickname: string; avatarUrl: string | null; profileCompany?: string | null; profileTitle?: string | null; profileLocation?: string | null; profileBio?: string | null; profileSignature?: string | null; language: string }): PublicUser & { email?: string | null; phone?: string | null } {
  return {
    id: user.id,
    email: user.profileEmailPublic ? user.email : null,
    phone: user.profilePhonePublic ? user.phone : null,
    publicId: user.publicId ?? undefined,
    profilePublic: user.profilePublic ?? true,
    profileEmailPublic: user.profileEmailPublic ?? false,
    profilePhonePublic: user.profilePhonePublic ?? false,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? undefined,
    company: user.profileCompany ?? undefined,
    title: user.profileTitle ?? undefined,
    location: user.profileLocation ?? undefined,
    bio: user.profileBio ?? undefined,
    signature: user.profileSignature ?? undefined,
    language: user.language.toLowerCase() === "en" ? "en" : "zh"
  };
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveGroupOwner(conversation: Conversation) {
    if (conversation.ownerId) return conversation.ownerId;
    const firstMember = await this.prisma.conversationMember.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { joinedAt: "asc" },
      select: { userId: true }
    });
    if (!firstMember) return null;
    await this.prisma.conversation.update({ where: { id: conversation.id }, data: { ownerId: firstMember.userId } });
    return firstMember.userId;
  }



  private async hasAcceptedFriendship(currentUserId: string, otherUserId: string) {
    const friendship = await this.prisma.friendRequest.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: currentUserId, receiverId: otherUserId },
          { requesterId: otherUserId, receiverId: currentUserId }
        ]
      }
    });
    return Boolean(friendship);
  }

  private async hasMutualDirectMessages(currentUserId: string, otherUserId: string) {
    const senders = await this.prisma.message.findMany({
      where: {
        conversationId: directConversationId(currentUserId, otherUserId),
        senderId: { in: [currentUserId, otherUserId] }
      },
      distinct: ["senderId"],
      select: { senderId: true },
      take: 2
    });
    const senderIds = new Set(senders.map((message) => message.senderId));
    return senderIds.has(currentUserId) && senderIds.has(otherUserId);
  }

  private async isEffectiveFriend(currentUserId: string, otherUserId: string) {
    if (await this.hasAcceptedFriendship(currentUserId, otherUserId)) return true;
    return this.hasMutualDirectMessages(currentUserId, otherUserId);
  }

  private async ensureFriends(currentUserId: string, otherUserId: string) {
    if (await this.isEffectiveFriend(currentUserId, otherUserId)) return;
    throw new ConflictException("You must be friends before starting a direct conversation.");
  }

  private async ensureGroupContact(currentUserId: string, otherUserId: string) {
    if (await this.isEffectiveFriend(currentUserId, otherUserId)) return;
    throw new ConflictException("Only contacts with mutual direct messages can be invited to a group.");
  }
  private async ensureNotBlocked(currentUserId: string, otherUserId: string) {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: currentUserId }
        ]
      }
    });
    if (block) throw new ConflictException("This user is blocked.");
  }

  async blockUser(currentUserId: string, blockedUserId: string) {
    if (currentUserId === blockedUserId) throw new BadRequestException("Cannot block yourself.");
    const blocked = await this.prisma.user.findUnique({ where: { id: blockedUserId } });
    if (!blocked) throw new NotFoundException("User was not found.");

    await this.prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { requesterId: currentUserId, receiverId: blockedUserId },
          { requesterId: blockedUserId, receiverId: currentUserId }
        ]
      }
    });

    const block = await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: blockedUserId } },
      update: {},
      create: { blockerId: currentUserId, blockedId: blockedUserId },
      include: { blocked: true }
    });

    return { id: block.id, user: toPublicUser(block.blocked), createdAt: block.createdAt.toISOString() };
  }

  async unblockUser(currentUserId: string, blockedUserId: string) {
    const block = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: blockedUserId } }
    });
    if (!block) throw new NotFoundException("Blocked user was not found.");
    await this.prisma.userBlock.delete({ where: { id: block.id } });
    return { ok: true };
  }

  async listBlockedUsers(currentUserId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: currentUserId },
      include: { blocked: true },
      orderBy: { createdAt: "desc" }
    });
    return blocks.map((block) => ({ id: block.id, user: toPublicUser(block.blocked), createdAt: block.createdAt.toISOString() }));
  }
  async searchUsers(currentUserId: string, query: string) {
    const keyword = query.trim();
    if (keyword.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        NOT: {
          OR: [
            { blocksReceived: { some: { blockerId: currentUserId } } },
            { blocksSent: { some: { blockedId: currentUserId } } }
          ]
        },
        OR: [
          { email: { contains: keyword, mode: "insensitive" } },
          { phone: { contains: keyword } },
          { nickname: { contains: keyword, mode: "insensitive" } },
          { publicId: { contains: keyword.toLowerCase(), mode: "insensitive" } }
        ]
      },
      take: 10,
      orderBy: { createdAt: "desc" }
    });
    return users.map(toPublicUser);
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      include: {
        conversation: {
          include: {
            members: { include: { user: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 }
          }
        }
      }
    });

    const summaries = await Promise.all(
      memberships.map(async ({ conversation, lastReadAt }) => {
        const latest = conversation.messages[0];
        const other = conversation.members.find((member) => member.userId !== userId)?.user;
        const title = conversation.type === "DIRECT" ? other?.nickname ?? conversation.title ?? "Direct chat" : conversation.title ?? "Group chat";
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {})
          }
        });
        return {
          id: conversation.id,
          type: conversation.type.toLowerCase() as "direct" | "group",
          title,
          avatarUrl: conversation.type === "DIRECT" ? other?.avatarUrl ?? undefined : conversation.avatarUrl ?? undefined,
          announcement: conversation.announcement ?? undefined,
          announcementScroll: conversation.type === "GROUP" ? conversation.announcementScroll : undefined,
          ownerId: conversation.type === "GROUP" ? conversation.ownerId ?? conversation.members.slice().sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0]?.userId ?? undefined : undefined,
          memberCount: conversation.members.length,
          otherUser: conversation.type === "DIRECT" && other ? toPublicUser(other) : undefined,
          latestMessage: latest?.body ?? undefined,
          latestMessageAt: latest?.createdAt.toISOString(),
          unreadCount
        };
      })
    );

    return summaries.sort((a, b) => new Date(b.latestMessageAt ?? 0).getTime() - new Date(a.latestMessageAt ?? 0).getTime());
  }


  private mapFriendRequest(row: {
    id: string;
    requesterId: string;
    receiverId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    requester: Parameters<typeof toPublicUser>[0];
    receiver: Parameters<typeof toPublicUser>[0];
  }, currentUserId: string) {
    const incoming = row.receiverId === currentUserId;
    return {
      id: row.id,
      status: row.status.toLowerCase(),
      direction: incoming ? "incoming" : "outgoing",
      user: toPublicUser(incoming ? row.requester : row.receiver),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  async sendFriendRequest(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) throw new BadRequestException("Cannot send a friend request to yourself.");
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("User was not found.");
    await this.ensureNotBlocked(currentUserId, otherUserId);

    

    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, receiverId: otherUserId },
          { requesterId: otherUserId, receiverId: currentUserId }
        ]
      },
      include: { requester: true, receiver: true }
    });

    if (existing?.status === "ACCEPTED") throw new ConflictException("You are already friends.");
    if (existing?.status === "PENDING") throw new ConflictException("A pending friend request already exists.");

    const request = existing && existing.requesterId === currentUserId
      ? await this.prisma.friendRequest.update({ where: { id: existing.id }, data: { status: "PENDING" }, include: { requester: true, receiver: true } })
      : await this.prisma.friendRequest.create({ data: { requesterId: currentUserId, receiverId: otherUserId }, include: { requester: true, receiver: true } });

    return this.mapFriendRequest(request, currentUserId);
  }

  async saveContact(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) throw new BadRequestException("Cannot add yourself as a contact.");
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("User was not found.");
    await this.ensureNotBlocked(currentUserId, otherUserId);

    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, receiverId: otherUserId },
          { requesterId: otherUserId, receiverId: currentUserId }
        ]
      }
    });

    if (existing) {
      await this.prisma.friendRequest.update({ where: { id: existing.id }, data: { status: "ACCEPTED" } });
    } else {
      await this.prisma.friendRequest.create({ data: { requesterId: currentUserId, receiverId: otherUserId, status: "ACCEPTED" } });
    }

    await this.createDirectConversation(currentUserId, otherUserId);
    return toPublicUser(other);
  }

  async listFriendRequests(currentUserId: string) {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        status: "PENDING",
        OR: [{ requesterId: currentUserId }, { receiverId: currentUserId }]
      },
      include: { requester: true, receiver: true },
      orderBy: { createdAt: "desc" }
    });
    return requests.map((request) => this.mapFriendRequest(request, currentUserId));
  }

  async respondToFriendRequest(currentUserId: string, requestId: string, accepted: boolean) {
    const existing = await this.prisma.friendRequest.findFirst({
      where: { id: requestId, receiverId: currentUserId, status: "PENDING" },
      include: { requester: true, receiver: true }
    });
    if (!existing) throw new NotFoundException("Pending friend request was not found.");

    const request = await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: accepted ? "ACCEPTED" : "REJECTED" },
      include: { requester: true, receiver: true }
    });

    if (accepted) {
      await this.createDirectConversation(currentUserId, existing.requesterId);
    }

    return this.mapFriendRequest(request, currentUserId);
  }


  async removeFriend(currentUserId: string, friendUserId: string) {
    if (currentUserId === friendUserId) throw new BadRequestException("Cannot remove yourself as a friend.");
    const friendship = await this.prisma.friendRequest.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: currentUserId, receiverId: friendUserId },
          { requesterId: friendUserId, receiverId: currentUserId }
        ]
      }
    });
    if (!friendship) throw new NotFoundException("Friendship was not found.");
    await this.prisma.friendRequest.delete({ where: { id: friendship.id } });
    return { ok: true };
  }
  async listFriends(currentUserId: string) {
    const byId = new Map<string, ReturnType<typeof toPublicUser>>();
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: currentUserId }, { receiverId: currentUserId }]
      },
      include: { requester: true, receiver: true },
      orderBy: { updatedAt: "desc" }
    });
    for (const request of requests) {
      const user = toPublicUser(request.requesterId === currentUserId ? request.receiver : request.requester);
      byId.set(user.id, user);
    }

    const directConversations = await this.prisma.conversation.findMany({
      where: {
        type: "DIRECT",
        members: { some: { userId: currentUserId } }
      },
      include: {
        members: { include: { user: true } },
        messages: { select: { senderId: true }, distinct: ["senderId"], take: 2 }
      },
      orderBy: { updatedAt: "desc" }
    });
    for (const conversation of directConversations) {
      const otherMember = conversation.members.find((member) => member.userId !== currentUserId);
      if (!otherMember) continue;
      const senderIds = new Set(conversation.messages.map((message) => message.senderId));
      if (!senderIds.has(currentUserId) || !senderIds.has(otherMember.userId)) continue;
      const user = toPublicUser(otherMember.user);
      byId.set(user.id, user);
    }

    return Array.from(byId.values());
  }
  async createGroupConversation(currentUserId: string, title: string, userIds: string[]): Promise<ConversationSummary> {
    const memberIds = Array.from(new Set(userIds.filter((id) => id && id !== currentUserId)));
    if (memberIds.length < 2) throw new BadRequestException("A group conversation needs at least two other members.");
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1) throw new BadRequestException("Group title is required.");

    const users = await this.prisma.user.findMany({ where: { id: { in: memberIds } } });
    if (users.length !== memberIds.length) throw new NotFoundException("One or more group members were not found.");

    for (const memberId of memberIds) {
      await this.ensureNotBlocked(currentUserId, memberId);
      await this.ensureGroupContact(currentUserId, memberId);
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        id: `group:${randomUUID()}`,
        type: "GROUP",
        title: trimmedTitle.slice(0, 80),
        ownerId: currentUserId,
        members: {
          create: [
            { userId: currentUserId, lastReadAt: new Date() },
            ...memberIds.map((userId) => ({ userId, invitedById: currentUserId }))
          ]
        }
      },
      include: {
        members: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    const latest = conversation.messages[0];
    return {
      id: conversation.id,
      type: "group",
      title: conversation.title ?? trimmedTitle,
      avatarUrl: conversation.avatarUrl ?? undefined,
      announcement: conversation.announcement ?? undefined,
      announcementScroll: conversation.announcementScroll,
      ownerId: conversation.ownerId ?? undefined,
      memberCount: conversation.members.length,
      latestMessage: latest?.body ?? undefined,
      latestMessageAt: latest?.createdAt.toISOString(),
      unreadCount: 0
    };
  }

  private async getGroupForMember(currentUserId: string, conversationId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
      include: { conversation: true }
    });
    if (!membership || membership.conversation.type !== "GROUP") throw new NotFoundException("Group conversation was not found.");
    return membership.conversation;
  }

  async listGroupMembers(currentUserId: string, conversationId: string): Promise<GroupMemberSummary[]> {
    const conversation = await this.getGroupForMember(currentUserId, conversationId);
    const ownerId = await this.resolveGroupOwner(conversation);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: true },
      orderBy: { joinedAt: "asc" }
    });
    const inviterIds = Array.from(new Set(members.map((member) => member.invitedById).filter(Boolean) as string[]));
    const inviters = inviterIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: inviterIds } } })
      : [];
    const inviterById = new Map(inviters.map((user) => [user.id, toPublicUser(user)]));
    return members.map((member) => ({
      id: member.id,
      user: toPublicUser(member.user),
      joinedAt: member.joinedAt.toISOString(),
      invitedById: member.invitedById,
      invitedBy: member.invitedById ? inviterById.get(member.invitedById) ?? null : null,
      isOwner: ownerId === member.userId
    }));
  }

  async inviteGroupMembers(currentUserId: string, conversationId: string, userIds: string[]) {
    const conversation = await this.getGroupForMember(currentUserId, conversationId);
    const memberIds = Array.from(new Set(userIds.filter((id) => id && id !== currentUserId)));
    if (memberIds.length < 1) throw new BadRequestException("Select at least one user to invite.");

    const existingMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { in: memberIds } },
      select: { userId: true }
    });
    const existingIds = new Set(existingMembers.map((member) => member.userId));
    const inviteeIds = memberIds.filter((id) => !existingIds.has(id));
    if (inviteeIds.length < 1) throw new ConflictException("Selected users are already in the group.");

    const users = await this.prisma.user.findMany({ where: { id: { in: inviteeIds } } });
    if (users.length !== inviteeIds.length) throw new NotFoundException("One or more invitees were not found.");
    for (const userId of inviteeIds) {
      await this.ensureNotBlocked(currentUserId, userId);
      await this.ensureGroupContact(currentUserId, userId);
    }

    await this.prisma.conversationMember.createMany({
      data: inviteeIds.map((userId) => ({ conversationId, userId, invitedById: currentUserId })),
      skipDuplicates: true
    });
    const members = await this.listGroupMembers(currentUserId, conversationId);
    const updated = await this.prisma.conversation.findUnique({ where: { id: conversation.id }, include: { members: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!updated) throw new NotFoundException("Group conversation was not found.");
    const latest = updated.messages[0];
    const summary: ConversationSummary = {
      id: updated.id,
      type: "group",
      title: updated.title ?? "Group chat",
      avatarUrl: updated.avatarUrl ?? undefined,
      announcement: updated.announcement ?? undefined,
      announcementScroll: updated.announcementScroll,
      ownerId: updated.ownerId ?? undefined,
      memberCount: updated.members.length,
      latestMessage: latest?.body ?? undefined,
      latestMessageAt: latest?.createdAt.toISOString(),
      unreadCount: 0
    };
    return { conversation: summary, members };
  }

  async updateGroupProfile(currentUserId: string, conversationId: string, dto: { title?: string; avatarUrl?: string; announcement?: string; announcementScroll?: boolean }): Promise<ConversationSummary> {
    const conversation = await this.getGroupForMember(currentUserId, conversationId);
    const ownerId = await this.resolveGroupOwner(conversation);
    if (ownerId !== currentUserId) throw new ForbiddenException("Only the group creator can update group settings.");
    const title = dto.title?.trim();
    const avatarUrl = dto.avatarUrl?.trim();
    const announcement = dto.announcement?.trim();
    const announcementScroll = dto.announcementScroll;
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(title !== undefined ? { title: title.slice(0, 80) || conversation.title } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
        ...(announcement !== undefined ? { announcement: announcement.slice(0, 1000) || null } : {}),
        ...(announcementScroll !== undefined ? { announcementScroll } : {})
      },
      include: { members: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    const latest = updated.messages[0];
    return {
      id: updated.id,
      type: "group",
      title: updated.title ?? "Group chat",
      avatarUrl: updated.avatarUrl ?? undefined,
      announcement: updated.announcement ?? undefined,
      announcementScroll: updated.announcementScroll,
      ownerId: updated.ownerId ?? undefined,
      memberCount: updated.members.length,
      latestMessage: latest?.body ?? undefined,
      latestMessageAt: latest?.createdAt.toISOString(),
      unreadCount: 0
    };
  }

  async dissolveGroup(currentUserId: string, conversationId: string) {
    const conversation = await this.getGroupForMember(currentUserId, conversationId);
    const ownerId = await this.resolveGroupOwner(conversation);
    if (ownerId !== currentUserId) throw new ForbiddenException("Only the group creator can dissolve the group.");
    const messages = await this.prisma.message.findMany({ where: { conversationId }, select: { id: true } });
    const messageIds = messages.map((message) => message.id);
    if (messageIds.length) await this.prisma.messageTranslation.deleteMany({ where: { messageId: { in: messageIds } } });
    await this.prisma.message.deleteMany({ where: { conversationId } });
    await this.prisma.conversationMember.deleteMany({ where: { conversationId } });
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { ok: true };
  }
  async createDirectConversation(currentUserId: string, otherUserId: string): Promise<ConversationSummary> {
    if (currentUserId === otherUserId) throw new BadRequestException("Cannot create a direct conversation with yourself.");
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("User was not found.");

    await this.ensureNotBlocked(currentUserId, otherUserId);
    const id = directConversationId(currentUserId, otherUserId);
    const conversation = await this.prisma.conversation.upsert({
      where: { id },
      update: {},
      create: {
        id,
        type: "DIRECT",
        title: other.nickname,
        members: {
          create: [{ userId: currentUserId, lastReadAt: new Date() }, { userId: otherUserId }]
        }
      },
      include: {
        members: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    const latest = conversation.messages[0];
    return {
      id: conversation.id,
      type: "direct",
      title: other.nickname,
      avatarUrl: other.avatarUrl ?? undefined,
      otherUser: toPublicUser(other),
      latestMessage: latest?.body ?? undefined,
      latestMessageAt: latest?.createdAt.toISOString(),
      unreadCount: 0
    };
  }
}







