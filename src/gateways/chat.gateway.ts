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
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly conversations: ConversationsService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      }) as { sub: string; email: string };

      client.data.userId = payload.sub;
      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return { error: 'Unauthorized' };

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
      select: { customerId: true, storeId: true },
    });

    if (!conversation) return { error: 'Conversation not found' };

    // Allow customer (owner) or store staff
    const isCustomer = conversation.customerId === userId;
    const isStaff = await this.prisma.staff.findFirst({
      where: { userId, storeId: conversation.storeId, status: 'ACTIVE' },
    });

    if (!isCustomer && !isStaff) return { error: 'Forbidden' };

    await client.join(`conv:${data.conversationId}`);
    return { joined: true, conversationId: data.conversationId };
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId) return { error: 'Unauthorized' };
    if (!data.content?.trim()) return { error: 'Empty message' };

    try {
      await this.conversations.processMessage(
        data.conversationId,
        userId,
        data.content.trim(),
        (event, payload) => this.emitToConversation(data.conversationId, event, payload),
      );
      return { sent: true };
    } catch (err: any) {
      return { error: err.message ?? 'Failed to process message' };
    }
  }

  emitToConversation(conversationId: string, event: string, data: unknown) {
    this.server.to(`conv:${conversationId}`).emit(event, data);
  }
}
