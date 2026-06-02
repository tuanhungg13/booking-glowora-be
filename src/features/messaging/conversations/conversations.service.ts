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
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

const TELEGRAM_ACTIVE_TTL = 7200; // 2 hours
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

  async create(dto: CreateConversationDto) {
    return this.prisma.conversation.upsert({
      where: { customerId_storeId: { customerId: dto.customerId, storeId: dto.storeId } },
      update: {},
      create: { customerId: dto.customerId, storeId: dto.storeId, mode: 'HUMAN' },
      include: conversationInclude,
    });
  }

  async findByStore(requesterId: string, storeId: string, params?: { skip?: number; take?: number }) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (store.ownerId !== requesterId) {
      const isStaff = await this.prisma.staff.findFirst({
        where: { userId: requesterId, storeId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!isStaff) throw new ForbiddenException('Not an owner or active staff of this store');
    }

    return this.findAll({ storeId, ...params });
  }

  async findAll(params?: { customerId?: string; storeId?: string; skip?: number; take?: number }) {
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
    return { items, total };
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
    if (!conversation) throw new NotFoundException('Conversation not found');

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

  // ─── Core chat processing ──────────────────────────────────────────────────

  async processMessage(
    conversationId: string,
    senderId: string,
    content: string,
    emitFn: (event: string, data: unknown) => void,
  ) {
    this.logger.log(`[processMessage] conversationId=${conversationId} senderId=${senderId}`);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: { select: { id: true, fullName: true } },
        store: { select: { telegramGroupId: true } },
        assignedStaff: { select: { telegramChatId: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.customerId !== senderId) throw new ForbiddenException();

    this.logger.log(
      `[processMessage] store.telegramGroupId=${conversation.store.telegramGroupId ?? 'NULL'} ` +
      `assignedStaff.telegramChatId=${conversation.assignedStaff?.telegramChatId ?? 'NULL'} ` +
      `telegramTopicId=${conversation.telegramTopicId ?? 'NULL'}`,
    );

    const customerMsg = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { conversationId, senderId, senderType: SenderType.CUSTOMER, content },
        include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: msg.createdAt, lastMessageBody: content.slice(0, 200) },
      });
      return msg;
    });

    this.logger.log(`[processMessage] Message saved to DB, messageId=${customerMsg.id}`);

    emitFn('message_received', customerMsg);
    this.logger.log(`[processMessage] WebSocket broadcast sent`);

    await this.forwardToStaff(conversation, content);
  }

  async handleStaffReply(conversationId: string, telegramChatId: string, content: string) {
    this.logger.log(`[handleStaffReply] conversationId=${conversationId} senderChatId=${telegramChatId}`);

    const staff = await this.prisma.staff.findFirst({
      where: { telegramChatId },
      select: { userId: true },
    });

    if (!staff) {
      this.logger.warn(`[handleStaffReply] No linked staff found for chatId=${telegramChatId} — message ignored`);
      return null;
    }
    const senderId = staff.userId;
    this.logger.log(`[handleStaffReply] Sender = linked staff userId=${senderId}`);

    return this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId,
          senderType: SenderType.STAFF,
          content,
        },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true } },
          conversation: { select: { store: { select: { id: true, name: true, logoUrl: true } } } },
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: msg.createdAt, lastMessageBody: content.slice(0, 200) },
      });
      return msg;
    });
  }

  async processStaffMessage(
    conversationId: string,
    staffUserId: string,
    content: string,
    emitFn: (event: string, data: unknown) => void,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, storeId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const staff = await this.prisma.staff.findFirst({
      where: { userId: staffUserId, storeId: conversation.storeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) throw new ForbiddenException('Not a staff member of this store');

    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversationId,
          senderId: staffUserId,
          senderType: SenderType.STAFF,
          content,
        },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true } },
          conversation: { select: { store: { select: { id: true, name: true, logoUrl: true } } } },
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: m.createdAt, lastMessageBody: content.slice(0, 200) },
      });
      return m;
    });

    emitFn('message_received', msg);
    return msg;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async forwardToStaff(
    conversation: {
      id: string;
      telegramTopicId?: number | null;
      store: { telegramGroupId: string | null };
      assignedStaff: { telegramChatId: string | null } | null;
      customer: { fullName: string };
    },
    content: string,
  ) {
    this.logger.log(`[forwardToStaff] conversationId=${conversation.id} telegramEnabled=${this.telegram.isEnabled}`);

    const groupId = conversation.store.telegramGroupId;

    if (groupId) {
      this.logger.log(`[forwardToStaff] PATH=GROUP_TOPIC groupId=${groupId}`);

      let topicId = conversation.telegramTopicId ?? null;
      this.logger.log(`[forwardToStaff] existing telegramTopicId=${topicId ?? 'NULL (will create new)'}`);

      if (!topicId) {
        const topicName = `${conversation.customer.fullName} — ${new Date().toLocaleDateString('vi-VN')}`;
        this.logger.log(`[forwardToStaff] Creating new topic: "${topicName}"`);
        topicId = await this.telegram.createGroupTopic(groupId, topicName);
        this.logger.log(`[forwardToStaff] createGroupTopic result: topicId=${topicId ?? 'NULL (FAILED)'}`);

        if (topicId) {
          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { telegramTopicId: topicId },
          });
          await this.redis.set(TOPIC_KEY(groupId, topicId), conversation.id, TELEGRAM_ACTIVE_TTL);
          this.logger.log(`[forwardToStaff] Saved topicId=${topicId} to DB and Redis`);
        } else {
          this.logger.warn(
            `[forwardToStaff] ❌ Topic creation FAILED — message will NOT be forwarded to Telegram. ` +
            `Check: (1) bot is admin in group ${groupId}, (2) group has Topics/Forum enabled, ` +
            `(3) groupId format is correct (should be -100xxxxxxxxxx).`,
          );
        }
      }

      if (topicId) {
        // Refresh TTL mỗi lần có tin nhắn mới, tránh key hết hạn giữa chừng
        await this.redis.set(TOPIC_KEY(groupId, topicId), conversation.id, TELEGRAM_ACTIVE_TTL);
        const text = `💬 *${conversation.customer.fullName}*:\n${content}`;
        this.logger.log(`[forwardToStaff] Sending to group topic groupId=${groupId} topicId=${topicId}`);
        await this.telegram.sendToGroupTopic(groupId, topicId, text);
        this.logger.log(`[forwardToStaff] ✅ Message forwarded to Telegram group topic`);
      } else {
        this.logger.warn(`[forwardToStaff] ❌ No topicId available — Telegram forwarding skipped`);
      }
      return;
    }

    // Fallback: DM nếu store chưa setup group
    this.logger.log(`[forwardToStaff] PATH=DM_FALLBACK (store has no telegramGroupId)`);
    const chatId = conversation.assignedStaff?.telegramChatId;
    if (chatId) {
      this.logger.log(`[forwardToStaff] Sending DM to assignedStaff chatId=${chatId}`);
      // Set key để handleDmReply biết conversationId khi staff reply
      await this.redis.set(`telegram:active:${chatId}`, conversation.id, TELEGRAM_ACTIVE_TTL);
      await this.telegram.sendNewMessage(chatId, conversation.customer.fullName, content);
      this.logger.log(`[forwardToStaff] ✅ DM sent to staff`);
    } else {
      this.logger.warn(
        `[forwardToStaff] ❌ DM_FALLBACK skipped — assignedStaff=${conversation.assignedStaff ? 'exists but telegramChatId=NULL' : 'NULL (no assigned staff)'}. ` +
        `Message saved to DB but NOT forwarded to Telegram.`,
      );
    }
  }

}
