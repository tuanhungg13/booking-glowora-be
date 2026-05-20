import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConversationMode, SenderType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { GeminiService } from '../../../ai/gemini.service';
import { TelegramService } from '../../../telegram/telegram.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

const TELEGRAM_ACTIVE_TTL = 7200; // 2 hours
const TOPIC_KEY = (groupId: string, topicId: number) =>
  `telegram:topic:${groupId}:${topicId}`;
const HISTORY_LIMIT = 10;

const conversationInclude = {
  customer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  store: true,
  _count: { select: { messages: true } },
} as const;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gemini: GeminiService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
  ) {}

  async create(dto: CreateConversationDto) {
    return this.prisma.conversation.upsert({
      where: { customerId_storeId: { customerId: dto.customerId, storeId: dto.storeId } },
      update: {},
      create: { customerId: dto.customerId, storeId: dto.storeId },
      include: conversationInclude,
    });
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
        orderBy: { updatedAt: 'desc' },
        include: conversationInclude,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        ...conversationInclude,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
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

    emitFn('message_received', customerMsg);

    if (conversation.mode === ConversationMode.BOT) {
      await this.handleBotReply(conversation, content, emitFn);
    } else {
      await this.forwardToStaff(conversation, content);
    }
  }

  async handleStaffReply(conversationId: string, telegramChatId: string, content: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { telegramChatId },
      select: { userId: true },
    });
    if (!staff) return null;

    return this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: staff.userId,
          senderType: SenderType.STAFF,
          content,
        },
        include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: msg.createdAt, lastMessageBody: content.slice(0, 200) },
      });
      return msg;
    });
  }

  async escalateToHuman(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: { select: { id: true, fullName: true } },
        store: { select: { id: true, telegramGroupId: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { content: true, senderType: true },
        },
      },
    });
    if (!conversation || conversation.mode === ConversationMode.HUMAN) return null;

    const lastMessages = [...conversation.messages].reverse();
    const groupId = conversation.store.telegramGroupId;

    if (groupId) {
      // Group mode: tạo topic mới cho conversation này
      const topicName = `${conversation.customer.fullName} — ${new Date().toLocaleDateString('vi-VN')}`;
      const topicId = await this.telegram.createGroupTopic(groupId, topicName);

      const updated = await this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          mode: ConversationMode.HUMAN,
          telegramTopicId: topicId,
        },
      });

      if (topicId) {
        const preview = lastMessages
          .map((m) => `${m.senderType === 'BOT' ? '🤖' : '👤'} ${m.content}`)
          .join('\n');
        const alertText =
          `🔔 *Khách hàng cần tư vấn trực tiếp*\n\n` +
          `👤 Khách: *${conversation.customer.fullName}*\n\n` +
          (preview ? `📋 Lịch sử:\n${preview}\n\n` : '') +
          `💬 Reply trong topic này để trả lời khách.`;
        await this.telegram.sendToGroupTopic(groupId, topicId, alertText);
        await this.redis.set(TOPIC_KEY(groupId, topicId), conversationId, TELEGRAM_ACTIVE_TTL);
      }

      return updated;
    }

    // Fallback: DM tới staff cá nhân
    const ownerStaff = await this.prisma.staff.findFirst({
      where: { storeId: conversation.store.id, status: 'ACTIVE', telegramChatId: { not: null } },
      select: { id: true, telegramChatId: true },
    });

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { mode: ConversationMode.HUMAN, assignedStaffId: ownerStaff?.id ?? null },
    });

    if (ownerStaff?.telegramChatId) {
      await this.telegram.sendEscalationAlert(
        ownerStaff.telegramChatId,
        conversation.customer.fullName,
        lastMessages,
        conversationId,
      );
      await this.redis.set(
        `telegram:active:${ownerStaff.telegramChatId}`,
        conversationId,
        TELEGRAM_ACTIVE_TTL,
      );
    }

    return updated;
  }

  async setBotMode(conversationId: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { mode: ConversationMode.BOT, assignedStaffId: null },
    });
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
    const groupId = conversation.store.telegramGroupId;
    const topicId = conversation.telegramTopicId;

    if (groupId && topicId) {
      const text = `💬 *${conversation.customer.fullName}*:\n${content}`;
      await this.telegram.sendToGroupTopic(groupId, topicId, text);
    } else {
      const chatId = conversation.assignedStaff?.telegramChatId;
      if (chatId) {
        await this.telegram.sendNewMessage(chatId, conversation.customer.fullName, content);
      }
    }
  }

  private async handleBotReply(
    conversation: { id: string; storeId: string; customerId: string },
    userMessage: string,
    emitFn: (event: string, data: unknown) => void,
  ) {
    const [shopContext, recentMessages] = await Promise.all([
      this.gemini.buildShopContext(conversation.storeId),
      this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: { content: true, senderType: true },
      }),
    ]);

    const history = [...recentMessages]
      .reverse()
      .slice(0, -1)
      .map((m) => ({
        role: m.senderType === SenderType.CUSTOMER ? ('user' as const) : ('model' as const),
        content: m.content,
      }));

    const { reply, escalate } = await this.gemini.chat(history, userMessage, shopContext);

    const botMsg = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: conversation.id,
          // bot messages use customerId as senderId (valid FK, senderType=BOT distinguishes them)
          senderId: conversation.customerId,
          senderType: SenderType.BOT,
          content: reply,
        },
        include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: msg.createdAt, lastMessageBody: reply.slice(0, 200) },
      });
      return msg;
    });

    emitFn('message_received', botMsg);

    if (escalate) {
      await this.escalateToHuman(conversation.id);
      emitFn('mode_changed', { conversationId: conversation.id, mode: ConversationMode.HUMAN });
    }
  }
}
