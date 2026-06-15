import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { SenderType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { TelegramService } from '../../../telegram/telegram.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';

const TELEGRAM_ACTIVE_TTL = 7200; // 2 hours

export interface MessageAttachmentInput {
  type: 'image' | 'video';
  url: string;
  publicId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
}
const TOPIC_KEY = (groupId: string, topicId: number) =>
  `telegram:topic:${groupId}:${topicId}`;

const conversationInclude = {
  customer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  store: true,
  _count: { select: { messages: true } },
} as const;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
  ) {}

  async create(storeId: string, customerId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true },
    });
    if (!store) throw new NotFoundException('Không tìm thấy cửa hàng');

    if (store.ownerId === customerId) {
      throw new ForbiddenException('Chủ cửa hàng không thể nhắn tin với cửa hàng của mình');
    }

    const isStaff = await this.prisma.staff.findFirst({
      where: { userId: customerId, storeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (isStaff) {
      throw new ForbiddenException('Nhân viên không thể nhắn tin với cửa hàng của mình');
    }

    return this.prisma.conversation.upsert({
      where: { customerId_storeId: { customerId, storeId } },
      update: {},
      create: { customerId, storeId, mode: 'HUMAN' },
      include: conversationInclude,
    });
  }

  async findByStore(requesterId: string, storeId: string, params?: { skip?: number; take?: number; callerSenderType?: SenderType }) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true },
    });
    if (!store) throw new NotFoundException('Không tìm thấy cửa hàng');

    if (store.ownerId !== requesterId) {
      const isStaff = await this.prisma.staff.findFirst({
        where: { userId: requesterId, storeId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!isStaff) throw new ForbiddenException('Bạn không phải chủ hoặc nhân viên của cửa hàng này');
    }

    return this.findAll({ storeId, ...params });
  }

  async findAll(params?: { customerId?: string; storeId?: string; skip?: number; take?: number; callerSenderType?: SenderType }) {
    const where = {
      ...(params?.customerId && { customerId: params.customerId }),
      ...(params?.storeId && { storeId: params.storeId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        include: conversationInclude,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    if (!params?.callerSenderType || items.length === 0) {
      return { items, total };
    }

    const unreadGroups = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: items.map((c) => c.id) },
        isRead: false,
        senderType: { not: params.callerSenderType },
      },
      _count: { _all: true },
    });

    const unreadMap = new Map(unreadGroups.map((g) => [g.conversationId, g._count._all]));

    return {
      items: items.map((c) => ({ ...c, unreadCount: unreadMap.get(c.id) ?? 0 })),
      total,
    };
  }

  async findOne(id: string, requesterId?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        ...conversationInclude,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');

    conversation.messages.reverse();

    if (requesterId) {
      const isCustomer = conversation.customerId === requesterId;
      const isOwner = (conversation.store as any).ownerId === requesterId;
      if (!isCustomer && !isOwner) {
        const isStaff = await this.prisma.staff.findFirst({
          where: { userId: requesterId, storeId: conversation.storeId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!isStaff) throw new ForbiddenException();
      }
    }

    return conversation;
  }

  async update(id: string, dto: UpdateConversationDto) {
    await this.findOne(id);
    return this.prisma.conversation.update({
      where: { id },
      data: {
        lastMessageBody: dto.lastMessageBody,
        lastMessageAt: dto.lastMessageBody ? new Date() : undefined,
      },
      include: conversationInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.conversation.delete({ where: { id } });
    return { deleted: true };
  }

  async markAsRead(conversationId: string, callerId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { customerId: true, storeId: true, store: { select: { ownerId: true } } },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');

    const isCustomer = conversation.customerId === callerId;
    if (!isCustomer) {
      const isOwner = conversation.store.ownerId === callerId;
      if (!isOwner) {
        const isStaff = await this.prisma.staff.findFirst({
          where: { userId: callerId, storeId: conversation.storeId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!isStaff) throw new ForbiddenException();
      }
    }

    const callerSenderType = isCustomer ? SenderType.CUSTOMER : SenderType.STAFF;

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        isRead: false,
        senderType: { not: callerSenderType },
      },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  // ─── Core chat processing ──────────────────────────────────────────────────

  async processMessage(
    conversationId: string,
    senderId: string,
    content: string,
    attachments: MessageAttachmentInput[],
    emitFn: (event: string, data: unknown) => void,
    emitToStoreFn: (storeId: string, event: string, data: unknown) => void,
  ) {
    this.logger.log(`[processMessage] conversationId=${conversationId} senderId=${senderId}`);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: { select: { id: true, fullName: true } },
        store: { select: { telegramGroupId: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    if (conversation.customerId !== senderId) throw new ForbiddenException();

    this.logger.log(
      `[processMessage] store.telegramGroupId=${conversation.store.telegramGroupId ?? 'NULL'} ` +
      `telegramTopicId=${conversation.telegramTopicId ?? 'NULL'}`,
    );

    const preview = content.trim()
      ? content.slice(0, 200)
      : attachments.length > 0
        ? (attachments[0].type === 'video' ? '[Video]' : attachments.length > 1 ? `[${attachments.length} ảnh]` : '[Ảnh]')
        : '';

    const customerMsg = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId,
          senderType: SenderType.CUSTOMER,
          content,
          ...(attachments.length > 0 && { attachments: attachments as any }),
        },
        include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: msg.createdAt, lastMessageBody: preview },
      });
      return msg;
    });

    this.logger.log(`[processMessage] Message saved to DB, messageId=${customerMsg.id}`);

    emitFn('message_received', customerMsg);
    emitToStoreFn(conversation.storeId, 'new_customer_message', {
      conversationId,
      preview,
      customerId: conversation.customerId,
      customerName: conversation.customer.fullName,
      messageAt: customerMsg.createdAt,
    });
    this.logger.log(`[processMessage] WebSocket broadcast sent`);

    await this.forwardToStaff(conversation, content, attachments);
  }

  async handleStaffReply(conversationId: string, _senderChatId: string, content: string, attachments: MessageAttachmentInput[] = []) {
    this.logger.log(`[handleStaffReply] conversationId=${conversationId}`);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { storeId: true, store: { select: { ownerId: true } } },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');

    const senderId = conversation.store.ownerId;
    this.logger.log(`[handleStaffReply] Sender = store owner userId=${senderId}`);

    return this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId,
          senderType: SenderType.STAFF,
          content,
          ...(attachments.length > 0 && { attachments: attachments as any }),
        },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true } },
          conversation: { select: { customerId: true, store: { select: { id: true, name: true, logoUrl: true } } } },
        },
      });
      const preview = content.slice(0, 200) || (attachments.length > 0 ? (attachments[0].type === 'video' ? '[Video]' : '[Ảnh]') : '');
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: msg.createdAt, lastMessageBody: preview },
      });
      return msg;
    });
  }

  async processStaffMessage(
    conversationId: string,
    staffUserId: string,
    content: string,
    attachments: MessageAttachmentInput[],
    emitFn: (event: string, data: unknown) => void,
    emitToUserFn: (userId: string, event: string, data: unknown) => void,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        telegramTopicId: true,
        store: { select: { telegramGroupId: true } },
        customer: { select: { fullName: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');

    const staff = await this.prisma.staff.findFirst({
      where: { userId: staffUserId, storeId: conversation.storeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) throw new ForbiddenException('Bạn không phải nhân viên của cửa hàng này');

    const preview = content.trim()
      ? content.slice(0, 200)
      : attachments.length > 0
        ? (attachments[0].type === 'video' ? '[Video]' : attachments.length > 1 ? `[${attachments.length} ảnh]` : '[Ảnh]')
        : '';

    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversationId,
          senderId: staffUserId,
          senderType: SenderType.STAFF,
          content,
          ...(attachments.length > 0 && { attachments: attachments as any }),
        },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true } },
          conversation: { select: { store: { select: { id: true, name: true, logoUrl: true } } } },
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: m.createdAt, lastMessageBody: preview },
      });
      return m;
    });

    emitFn('message_received', msg);
    emitToUserFn(conversation.customerId, 'new_message_notification', {
      conversationId,
      storeName: (msg as any).conversation.store.name,
      preview,
    });
    const staffName = (msg as any).sender?.fullName ?? 'Nhân viên';
    await this.forwardToStaff(conversation, content, attachments, `👤 *Nhân viên - ${staffName}*`);
    return msg;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async forwardToStaff(
    conversation: {
      id: string;
      telegramTopicId?: number | null;
      store: { telegramGroupId: string | null };
      customer: { fullName: string };
    },
    content: string,
    attachments: MessageAttachmentInput[] = [],
    senderLabel?: string,
  ) {
    const groupId = conversation.store.telegramGroupId;
    if (!groupId) {
      this.logger.warn(`[forwardToStaff] Store has no telegramGroupId — message not forwarded`);
      return;
    }

    this.logger.log(`[forwardToStaff] groupId=${groupId}`);

    let topicId = conversation.telegramTopicId ?? null;

    if (!topicId) {
      const topicName = `${conversation.customer.fullName} — ${new Date().toLocaleDateString('vi-VN')}`;
      topicId = await this.telegram.createGroupTopic(groupId, topicName);

      if (topicId) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { telegramTopicId: topicId },
        });
        await this.redis.set(TOPIC_KEY(groupId, topicId), conversation.id, TELEGRAM_ACTIVE_TTL);
      } else {
        this.logger.warn(
          `[forwardToStaff] ❌ Topic creation FAILED — groupId=${groupId}. ` +
          `Check: bot is admin, Topics enabled, groupId format (-100xxxxxxxxxx).`,
        );
        return;
      }
    }

    await this.redis.set(TOPIC_KEY(groupId, topicId), conversation.id, TELEGRAM_ACTIVE_TTL);

    if (content.trim()) {
      const label = senderLabel ?? `💬 *${conversation.customer.fullName}*`;
      await this.telegram.sendToGroupTopic(groupId, topicId, `${label}:\n${content}`);
    }
    for (const att of attachments) {
      if (att.type === 'image') {
        await this.telegram.sendPhotoToGroupTopic(groupId, topicId, att.url);
      } else {
        await this.telegram.sendVideoToGroupTopic(groupId, topicId, att.url);
      }
    }
    this.logger.log(`[forwardToStaff] ✅ Forwarded to group topic topicId=${topicId}`);
  }

}
