import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConversationsService } from '../features/messaging/conversations/conversations.service';
import { GeminiService, ChatMessage } from '../ai/gemini.service';
import { PrismaService } from '../prisma/prisma.service';

// Giới hạn lịch sử AI chat giữ trong memory (tính theo lượt, 1 lượt = user + model)
const AI_HISTORY_MAX_TURNS = 10;

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Lưu lịch sử AI chat theo socketId — xóa khi disconnect
  private readonly aiSessions = new Map<string, ChatMessage[]>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly conversations: ConversationsService,
    private readonly gemini: GeminiService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

    if (!token) {
      // Không có token → khách ẩn danh, vẫn cho kết nối (chỉ dùng được ai_chat)
      this.logger.log(`Client connected (anonymous): ${client.id}`);
      return;
    }

    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      }) as { sub: string; email: string };

      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      // Token không hợp lệ → cũng cho kết nối như ẩn danh (không set userId)
      this.logger.log(`Client connected (invalid token): ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.aiSessions.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return { error: 'Không có quyền truy cập' };

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
      select: { customerId: true, storeId: true },
    });

    if (!conversation) return { error: 'Không tìm thấy cuộc trò chuyện' };

    const isCustomer = conversation.customerId === userId;
    const isStaff = await this.prisma.staff.findFirst({
      where: { userId, storeId: conversation.storeId, status: 'ACTIVE' },
    });

    if (!isCustomer && !isStaff) return { error: 'Truy cập bị từ chối' };

    await client.join(`conv:${data.conversationId}`);
    return { joined: true, conversationId: data.conversationId };
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string; attachments?: any[] },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return { error: 'Không có quyền truy cập' };

    const hasContent = !!data.content?.trim();
    const hasAttachments = Array.isArray(data.attachments) && data.attachments.length > 0;
    if (!hasContent && !hasAttachments) return { error: 'Tin nhắn phải có nội dung hoặc file đính kèm' };

    try {
      await this.conversations.processMessage(
        data.conversationId,
        userId,
        data.content?.trim() ?? '',
        data.attachments ?? [],
        (event, payload) => this.emitToConversation(data.conversationId, event, payload),
        (storeId, event, payload) => this.emitToStore(storeId, event, payload),
      );
      return { sent: true };
    } catch (err: any) {
      return { error: err.message ?? 'Failed to process message' };
    }
  }

  @SubscribeMessage('staff_send_message')
  async handleStaffMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string; attachments?: any[] },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return { error: 'Không có quyền truy cập' };

    const hasContent = !!data.content?.trim();
    const hasAttachments = Array.isArray(data.attachments) && data.attachments.length > 0;
    if (!hasContent && !hasAttachments) return { error: 'Tin nhắn phải có nội dung hoặc file đính kèm' };

    try {
      await this.conversations.processStaffMessage(
        data.conversationId,
        userId,
        data.content?.trim() ?? '',
        data.attachments ?? [],
        (event, payload) => this.emitToConversation(data.conversationId, event, payload),
        (toUserId, event, payload) => this.emitToUser(toUserId, event, payload),
      );
      return { sent: true };
    } catch (err: any) {
      return { error: err.message ?? 'Failed to process message' };
    }
  }

  // ─── Global AI chat (public — không cần đăng nhập) ──────────────────────────

  @SubscribeMessage('ai_chat')
  async handleAiChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { message: string; location?: { lat: number; lng: number; cityName?: string | null } },
  ) {
    const message = data.message?.trim();
    if (!message) return { error: 'Nội dung tin nhắn không được để trống' };

    // Lấy lịch sử của session này (theo socketId)
    const history = this.aiSessions.get(client.id) ?? [];

    const context = await this.gemini.buildPlatformContext();
    const { reply, suggestedKeywords, suggestedStoreKeywords, suggestedLocationKeywords } = await this.gemini.chatGlobal(history, message, context, data.location);

    this.logger.debug(`[ai_chat] message="${message}" | reply="${reply}"`);
    this.logger.debug(`[ai_chat] tags → suggestedKeywords=${JSON.stringify(suggestedKeywords)} | suggestedStoreKeywords=${JSON.stringify(suggestedStoreKeywords)} | suggestedLocationKeywords=${JSON.stringify(suggestedLocationKeywords)}`);

    const [suggestions, storeSuggestions] = await Promise.all([
      this.gemini.fetchServicesByKeywords(suggestedKeywords),
      this.gemini.fetchStoresByKeywords(suggestedStoreKeywords, suggestedLocationKeywords, data.location),
    ]);

    this.logger.debug(`[ai_chat] suggestions (services)=${JSON.stringify(suggestions.map(s => ({ name: s.name, store: s.storeName })))}`);
    this.logger.debug(`[ai_chat] storeSuggestions=${JSON.stringify(storeSuggestions.map(s => ({ name: s.name, province: s.provinceName, address: s.address })))}`);

    let finalReply = reply;
    let finalStoreSuggestions = storeSuggestions;

    // Đã hỏi rõ dịch vụ + địa điểm nhưng không có store nào khớp cả 2
    // → gọi lại Gemini lần 2 với dữ liệu thật để trả lời chính xác thay vì để câu chào chung chung ở lượt 1
    const namedLocationKws = suggestedLocationKeywords.filter((k) => k !== '__near_me__');
    const hasLocation = suggestedLocationKeywords.length > 0;
    const hasService = suggestedStoreKeywords.length > 0;

    if (hasLocation && hasService && storeSuggestions.length === 0) {
      const elsewhereStores = await this.gemini.fetchStoresByKeywords(suggestedStoreKeywords, [], undefined);
      const locationLabel = namedLocationKws.length ? namedLocationKws.join(', ') : (data.location?.cityName ?? 'khu vực của bạn');
      finalReply = await this.gemini.composeNoStoreFoundReply(message, suggestedStoreKeywords, locationLabel, elsewhereStores, context);
      finalStoreSuggestions = elsewhereStores;

      this.logger.debug(`[ai_chat] no-result reply="${finalReply}" | elsewhereStores=${JSON.stringify(elsewhereStores.map(s => s.provinceName))}`);
    }

    // Cập nhật history, giới hạn AI_HISTORY_MAX_TURNS lượt gần nhất
    const updated: ChatMessage[] = [
      ...history,
      { role: 'user', content: message },
      { role: 'model', content: finalReply },
    ];
    const trimmed = updated.slice(-AI_HISTORY_MAX_TURNS * 2);
    this.aiSessions.set(client.id, trimmed);

    client.emit('ai_reply', { reply: finalReply, suggestions, storeSuggestions: finalStoreSuggestions });
    return { sent: true };
  }

  // ─── Reset lịch sử AI chat của session hiện tại ────────────────────────────

  @SubscribeMessage('ai_reset')
  handleAiReset(@ConnectedSocket() client: Socket) {
    this.aiSessions.delete(client.id);
    return { reset: true };
  }

  @SubscribeMessage('join_store')
  async handleJoinStore(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return { error: 'Không có quyền truy cập' };

    const store = await this.prisma.store.findUnique({
      where: { id: data.storeId },
      select: { ownerId: true },
    });
    if (!store) return { error: 'Không tìm thấy cửa hàng' };

    if (store.ownerId !== userId) {
      const isStaff = await this.prisma.staff.findFirst({
        where: { userId, storeId: data.storeId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!isStaff) return { error: 'Truy cập bị từ chối' };
    }

    await client.join(`store:${data.storeId}`);
    return { joined: true, storeId: data.storeId };
  }

  emitToConversation(conversationId: string, event: string, data: unknown) {
    this.server.to(`conv:${conversationId}`).emit(event, data);
  }

  emitToStore(storeId: string, event: string, data: unknown) {
    this.server.to(`store:${storeId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
