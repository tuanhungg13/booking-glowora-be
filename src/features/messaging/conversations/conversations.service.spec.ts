import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationMode, SenderType } from '@prisma/client';
import { ConversationsService } from './conversations.service';

describe('ConversationsService — Phase 6', () => {
  let service: ConversationsService;
  let prisma: any;
  let redis: any;
  let gemini: any;
  let telegram: any;
  let tx: any;

  const customerId = 'user-001';
  const storeId = 'store-001';
  const conversationId = 'conv-001';
  const staffId = 'staff-001';
  const staffUserId = 'user-staff-001';
  const telegramChatId = '123456789';

  const baseConversation = {
    id: conversationId,
    customerId,
    storeId,
    mode: ConversationMode.BOT,
    assignedStaffId: null,
    lastMessageAt: null,
    lastMessageBody: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseMessage = {
    id: 'msg-001',
    conversationId,
    senderId: customerId,
    senderType: SenderType.CUSTOMER,
    content: 'Xin chào',
    isRead: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    tx = {
      message: { create: jest.fn().mockResolvedValue(baseMessage) },
      conversation: { update: jest.fn().mockResolvedValue(baseConversation) },
    };

    prisma = {
      conversation: {
        upsert: jest.fn().mockResolvedValue(baseConversation),
        findUnique: jest.fn().mockResolvedValue({
          ...baseConversation,
          customer: { id: customerId, fullName: 'Test User' },
          assignedStaff: null,
          messages: [],
          store: { id: storeId },
        }),
        findMany: jest.fn().mockResolvedValue([baseConversation]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(baseConversation),
        delete: jest.fn().mockResolvedValue(baseConversation),
      },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      staff: {
        findFirst: jest.fn().mockResolvedValue({ id: staffId, userId: staffUserId, telegramChatId }),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
    };

    gemini = {
      buildShopContext: jest.fn().mockResolvedValue({
        storeName: 'Glowora Test',
        services: 'Massage',
        combos: '',
        workingHours: 'Thứ 2-6: 08:00-20:00',
      }),
      chat: jest.fn().mockResolvedValue({ reply: 'Xin chào! Tôi có thể giúp gì?', escalate: false }),
    };

    telegram = {
      sendEscalationAlert: jest.fn().mockResolvedValue(undefined),
      sendNewMessage: jest.fn().mockResolvedValue(undefined),
      isEnabled: true,
    };

    service = new ConversationsService(prisma, redis, gemini, telegram);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('upserts conversation (findOrCreate by customerId+storeId)', async () => {
      await service.create({ customerId, storeId });

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId_storeId: { customerId, storeId } },
          create: { customerId, storeId },
        }),
      );
    });

    it('returns the existing conversation on duplicate create', async () => {
      const result = await service.create({ customerId, storeId });
      expect(result.id).toBe(conversationId);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns items and total', async () => {
      const result = await service.findAll({ customerId });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters by customerId when provided', async () => {
      await service.findAll({ customerId });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ customerId }) }),
      );
    });

    it('filters by storeId when provided', async () => {
      await service.findAll({ storeId });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ storeId }) }),
      );
    });

    it('uses default take of 20 when not specified', async () => {
      await service.findAll({});

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns conversation when found', async () => {
      const result = await service.findOne(conversationId);
      expect(result.id).toBe(conversationId);
    });

    it('throws NotFoundException when conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates lastMessageBody and sets lastMessageAt', async () => {
      await service.update(conversationId, { lastMessageBody: 'Tin nhắn mới' });

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({ lastMessageBody: 'Tin nhắn mới' }),
        }),
      );
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes conversation and returns { deleted: true }', async () => {
      const result = await service.remove(conversationId);

      expect(prisma.conversation.delete).toHaveBeenCalledWith({ where: { id: conversationId } });
      expect(result).toEqual({ deleted: true });
    });
  });

  // ─── processMessage ───────────────────────────────────────────────────────

  describe('processMessage', () => {
    const emitFn = jest.fn();

    beforeEach(() => emitFn.mockClear());

    it('throws NotFoundException when conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.processMessage(conversationId, customerId, 'Hi', emitFn),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when sender is not the conversation customer', async () => {
      await expect(
        service.processMessage(conversationId, 'other-user', 'Hi', emitFn),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates customer message in transaction', async () => {
      await service.processMessage(conversationId, customerId, 'Xin chào', emitFn);

      expect(tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            senderId: customerId,
            senderType: SenderType.CUSTOMER,
            content: 'Xin chào',
          }),
        }),
      );
    });

    it('emits message_received event after creating customer message', async () => {
      await service.processMessage(conversationId, customerId, 'Xin chào', emitFn);

      expect(emitFn).toHaveBeenCalledWith('message_received', expect.anything());
    });

    it('calls GeminiService.chat when conversation mode is BOT', async () => {
      await service.processMessage(conversationId, customerId, 'Giá massage?', emitFn);

      expect(gemini.chat).toHaveBeenCalled();
    });

    it('does not call Gemini when conversation mode is HUMAN', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        mode: ConversationMode.HUMAN,
        customer: { id: customerId, fullName: 'Test User' },
        assignedStaff: { telegramChatId },
      });

      await service.processMessage(conversationId, customerId, 'Hi', emitFn);

      expect(gemini.chat).not.toHaveBeenCalled();
    });

    it('sends message to staff Telegram when mode is HUMAN and staff has telegramChatId', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        mode: ConversationMode.HUMAN,
        customer: { id: customerId, fullName: 'Test User' },
        assignedStaff: { telegramChatId },
      });

      await service.processMessage(conversationId, customerId, 'Hi', emitFn);

      expect(telegram.sendNewMessage).toHaveBeenCalledWith(telegramChatId, 'Test User', 'Hi');
    });
  });

  // ─── escalateToHuman ──────────────────────────────────────────────────────

  describe('escalateToHuman', () => {
    it('returns null when conversation is already in HUMAN mode', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        mode: ConversationMode.HUMAN,
        customer: { id: customerId, fullName: 'Test User' },
        store: { id: storeId },
        messages: [],
      });

      const result = await service.escalateToHuman(conversationId);
      expect(result).toBeNull();
    });

    it('updates conversation mode to HUMAN', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        mode: ConversationMode.BOT,
        customer: { id: customerId, fullName: 'Test User' },
        store: { id: storeId },
        messages: [],
      });

      await service.escalateToHuman(conversationId);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({ mode: ConversationMode.HUMAN }),
        }),
      );
    });

    it('assigns available staff and saves Redis key when staff has telegramChatId', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        mode: ConversationMode.BOT,
        customer: { id: customerId, fullName: 'Test User' },
        store: { id: storeId },
        messages: [],
      });

      await service.escalateToHuman(conversationId);

      expect(redis.set).toHaveBeenCalledWith(
        `telegram:active:${telegramChatId}`,
        conversationId,
        expect.any(Number),
      );
      expect(telegram.sendEscalationAlert).toHaveBeenCalled();
    });

    it('escalates without Telegram when no staff with telegramChatId found', async () => {
      prisma.staff.findFirst.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        mode: ConversationMode.BOT,
        customer: { id: customerId, fullName: 'Test User' },
        store: { id: storeId },
        messages: [],
      });

      await service.escalateToHuman(conversationId);

      expect(telegram.sendEscalationAlert).not.toHaveBeenCalled();
      expect(prisma.conversation.update).toHaveBeenCalled();
    });
  });

  // ─── setBotMode ───────────────────────────────────────────────────────────

  describe('setBotMode', () => {
    it('updates conversation mode to BOT and clears assignedStaffId', async () => {
      await service.setBotMode(conversationId);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: { mode: ConversationMode.BOT, assignedStaffId: null },
      });
    });
  });

  // ─── handleStaffReply ─────────────────────────────────────────────────────

  describe('handleStaffReply', () => {
    it('returns null when no staff found for telegramChatId', async () => {
      prisma.staff.findFirst.mockResolvedValue(null);

      const result = await service.handleStaffReply(conversationId, 'unknown-chat', 'Hi');
      expect(result).toBeNull();
    });

    it('creates staff message in transaction', async () => {
      await service.handleStaffReply(conversationId, telegramChatId, 'Xin chào khách!');

      expect(tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            senderType: SenderType.STAFF,
            content: 'Xin chào khách!',
          }),
        }),
      );
    });

    it('updates conversation lastMessageBody after staff reply', async () => {
      await service.handleStaffReply(conversationId, telegramChatId, 'Reply từ nhân viên');

      expect(tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastMessageBody: 'Reply từ nhân viên' }),
        }),
      );
    });
  });
});
