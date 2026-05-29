import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SenderType } from '@prisma/client';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: any;
  let redis: any;
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
    mode: 'HUMAN',
    assignedStaffId: null,
    telegramTopicId: null,
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
    sender: { id: customerId, fullName: 'Test User', avatarUrl: null },
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
          store: { telegramGroupId: null },
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

    telegram = {
      createGroupTopic: jest.fn().mockResolvedValue(42),
      sendToGroupTopic: jest.fn().mockResolvedValue(undefined),
      sendNewMessage: jest.fn().mockResolvedValue(undefined),
      isEnabled: true,
    };

    service = new ConversationsService(prisma, redis, telegram);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('upserts conversation with HUMAN mode by default', async () => {
      await service.create({ customerId, storeId });

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId_storeId: { customerId, storeId } },
          create: expect.objectContaining({ customerId, storeId, mode: 'HUMAN' }),
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

    it('creates Telegram topic and saves Redis key on first message when store has groupId', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        customer: { id: customerId, fullName: 'Test User' },
        assignedStaff: null,
        store: { telegramGroupId: '-100123' },
      });

      await service.processMessage(conversationId, customerId, 'Xin chào', emitFn);

      expect(telegram.createGroupTopic).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
      expect(telegram.sendToGroupTopic).toHaveBeenCalled();
    });

    it('reuses existing topic on subsequent messages', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        telegramTopicId: 42,
        customer: { id: customerId, fullName: 'Test User' },
        assignedStaff: null,
        store: { telegramGroupId: '-100123' },
      });

      await service.processMessage(conversationId, customerId, 'Tin thứ 2', emitFn);

      expect(telegram.createGroupTopic).not.toHaveBeenCalled();
      expect(telegram.sendToGroupTopic).toHaveBeenCalledWith('-100123', 42, expect.any(String));
    });

    it('sends DM to assigned staff when no group configured', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        customer: { id: customerId, fullName: 'Test User' },
        assignedStaff: { telegramChatId },
        store: { telegramGroupId: null },
      });

      await service.processMessage(conversationId, customerId, 'Hi', emitFn);

      expect(telegram.sendNewMessage).toHaveBeenCalledWith(telegramChatId, 'Test User', 'Hi');
    });

    it('does not send Telegram when no group and no assigned staff', async () => {
      await service.processMessage(conversationId, customerId, 'Hi', emitFn);

      expect(telegram.sendNewMessage).not.toHaveBeenCalled();
      expect(telegram.sendToGroupTopic).not.toHaveBeenCalled();
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
