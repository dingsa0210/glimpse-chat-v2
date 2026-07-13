import { SUPPORTED_TRANSLATION_LANGUAGES, type CallSignalPayload, type MessagePayload, type TranslationLanguage } from "@glimpse/shared";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { TranslationService } from "../translation/translation.service";
import { ChatStorageService } from "./chat-storage.service";

type AuthenticatedSocket = Socket & { data: { user?: AuthenticatedUser } };

function tokenFromSocket(client: Socket) {
  const authToken = client.handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;
  const authorization = client.handshake.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length);
  return undefined;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly activeUserSockets = new Map<string, number>();

  constructor(
    private readonly storage: ChatStorageService,
    private readonly auth: AuthService,
    private readonly translation: TranslationService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token = tokenFromSocket(client);
    if (!token) {
      client.emit("auth:error", { message: "Missing access token." });
      client.disconnect(true);
      return;
    }

    try {
      client.data.user = await this.auth.verifyAccessToken(token);
      void client.join(`user:${client.data.user.id}`);
      this.markUserOnline(client.data.user.id);
      client.emit("presence:state", { onlineUserIds: Array.from(this.activeUserSockets.keys()) });
    } catch {
      client.emit("auth:error", { message: "Invalid or expired access token." });
      client.disconnect(true);
    }
  }


  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data.user?.id;
    if (userId) this.markUserOffline(userId);
  }

  private markUserOnline(userId: string) {
    const current = this.activeUserSockets.get(userId) ?? 0;
    this.activeUserSockets.set(userId, current + 1);
    if (current === 0) this.server.emit("presence:update", { userId, online: true });
  }

  private markUserOffline(userId: string) {
    const current = this.activeUserSockets.get(userId) ?? 0;
    if (current <= 1) {
      this.activeUserSockets.delete(userId);
      this.server.emit("presence:update", { userId, online: false });
      return;
    }
    this.activeUserSockets.set(userId, current - 1);
  }
  @SubscribeMessage("conversation:join")
  async joinConversation(@MessageBody("conversationId") conversationId: string, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.requireUser(client);
    void client.join(`conversation:${conversationId}`);
    try {
      client.emit("conversation:history", {
        conversationId,
        messages: await this.storage.getHistory(conversationId, user.id, { limit: 50 })
      });
      const readAt = await this.storage.markConversationRead(conversationId, user.id);
      this.broadcastReadReceipt(conversationId, user.id, readAt);
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : "Could not load conversation history.");
    }
    return { ok: true, conversationId };
  }


  @SubscribeMessage("conversation:watch")
  async watchConversation(@MessageBody("conversationId") conversationId: string, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.requireUser(client);
    try {
      await this.storage.ensureConversationMember(conversationId, user.id);
      await client.join(`conversation:${conversationId}`);
      return { ok: true, conversationId };
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : "Could not watch conversation.");
    }
  }
  @SubscribeMessage("conversation:read")
  async markConversationRead(@MessageBody("conversationId") conversationId: string, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.requireUser(client);
    try {
      const readAt = await this.storage.markConversationRead(conversationId, user.id);
      this.broadcastReadReceipt(conversationId, user.id, readAt);
      return { ok: true, conversationId, readAt: readAt.toISOString() };
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : "Could not update read state.");
    }
  }

  @SubscribeMessage("message:send")
  async sendMessage(@MessageBody() payload: MessagePayload, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.requireUser(client);
    try {
      const translatedPayload = await this.withTranslations(payload);
      const message = await this.storage.saveMessage(
        {
          ...translatedPayload,
          senderId: user.id,
          senderName: user.nickname
        },
        user.id
      );
      this.server.to(`conversation:${message.conversationId}`).emit("message:new", message);
      return { ok: true, messageId: message.id };
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : "Could not send message.");
    }
  }



  @SubscribeMessage("message:revoke")
  async revokeMessage(@MessageBody() payload: { conversationId?: string; messageId?: string }, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.requireUser(client);
    try {
      if (!payload.conversationId || !payload.messageId) throw new WsException("Invalid revoke payload.");
      const message = await this.storage.revokeMessage(payload.conversationId, payload.messageId, user.id);
      this.server.to(`conversation:${payload.conversationId}`).emit("message:revoked", message);
      return { ok: true, message };
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : "Could not revoke message.");
    }
  }
  @SubscribeMessage("call:signal")
  async relayCallSignal(@MessageBody() payload: CallSignalPayload, @ConnectedSocket() client: AuthenticatedSocket) {
    const user = this.requireUser(client);
    try {
      if (!payload.conversationId || !payload.callId || !payload.signalType || !payload.media) {
        throw new WsException("Invalid call signal payload.");
      }
      await this.storage.ensureConversationMember(payload.conversationId, user.id);
      const event = {
        ...payload,
        fromUserId: user.id,
        fromName: user.nickname,
        createdAt: new Date().toISOString()
      };
      client.to(`conversation:${payload.conversationId}`).emit("call:signal", event);
      return { ok: true, callId: payload.callId, signalType: payload.signalType };
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : "Could not relay call signal.");
    }
  }

  private async withTranslations(payload: MessagePayload) {
    if (payload.type !== "text" || !payload.body?.trim()) return payload;
    const targetLanguage = payload.targetLanguage && SUPPORTED_TRANSLATION_LANGUAGES.includes(payload.targetLanguage) ? payload.targetLanguage : "en";
    const translated = await this.translation.translateText(payload.body, "auto", targetLanguage);
    return {
      ...payload,
      sourceLanguage: "auto" as const,
      targetLanguage,
      translations: translated ? { ...(payload.translations ?? {}), [targetLanguage]: translated } : payload.translations
    };
  }
  private broadcastReadReceipt(conversationId: string, userId: string, readAt: Date) {
    this.server.to(`conversation:${conversationId}`).emit("conversation:read", {
      conversationId,
      userId,
      readAt: readAt.toISOString()
    });
  }

  private requireUser(client: AuthenticatedSocket) {
    if (!client.data.user) throw new WsException("Unauthorized.");
    return client.data.user;
  }
}



