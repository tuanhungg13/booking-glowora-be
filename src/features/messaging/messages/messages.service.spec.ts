import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

describe('MessagesService — Phase 6', () => {
  let service: MessagesService;
  let prisma: any;
  let tx: any;

  const conversationId = 'conv-001';
  const senderId = 'user-001';
  const messageId = 'msg-001';

  const baseConversation = {
    id: conversationId,
    customerId: senderId,
    storeId: 'store-001',
    mode: 'BOT',
  };

  const baseMessage = {
    id: messageId,
    conversationId,
    senderId,
    content: 'Xin chào spa!',
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    sender: { id: senderId, fullName: 'Test User', email: 'test@test.com', avatarUrl: null },
  };

  beforeEach(() => {
    tx = {
      message: { create: jest.fn().mockResolvedValue(baseMessage) },
      conversation: { update: jest.fn().mockResolvedValue(baseConversation) },
    };

    prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(baseConversation),
      },
      message: {
        create: jest.fn().mockResolvedValue(baseMessage),
        findUnique: jest.fn().mockResolvedValue({ ...baseMessage, conversation: baseConversation }),
        findMany: jest.fn().mockResolvedValue([baseMessage]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({ ...baseMessage, isRead: true, readAt: new Date() }),
        delete: jest.fn().mockResolvedValue(baseMessage),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    service = new MessagesService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      conversationId,
      senderId,
      content: 'Xin chào spa!',
    };

    it('throws NotFoundException when conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates message inside a prisma.$transaction', async () => {
      await service.create(dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            senderId,
            content: 'Xin chào spa!',
          }),
        }),
      );
    });

    it('updates conversation lastMessageAt and lastMessageBody in same transaction', async () => {
      await service.create(dto);

      expect(tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({
            lastMessageBody: expect.any(String),
            lastMessageAt: expect.any(Date),
          }),
        }),
      );
    });

    it('truncates lastMessageBody to 200 characters', async () => {
      const longContent = 'A'.repeat(300);
      await service.create({ ...dto, content: longContent });

      expect(tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastMessageBody: expect.stringMatching(/^A{200}$/),
          }),
        }),
      );
    });

    it('defaults isRead to false when not provided', async () => {
      await service.create(dto);

      expect(tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isRead: false }),
        }),
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('throws NotFoundException when conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.findAll('missing-conv')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns items and total for valid conversation', async () => {
      const result = await service.findAll(conversationId);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters messages by conversationId', async () => {
      await service.findAll(conversationId);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId },
        }),
      );
    });

    it('applies pagination skip and take', async () => {
      await service.findAll(conversationId, { skip: 10, take: 25 });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 25 }),
      );
    });

    it('uses default take of 50 when not specified', async () => {
      await service.findAll(conversationId);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns message when found', async () => {
      const result = await service.findOne(messageId);
      expect(result.id).toBe(messageId);
    });

    it('throws NotFoundException when message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { isRead: true })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates isRead and sets readAt when marking as read', async () => {
      await service.update(messageId, { isRead: true });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isRead: true,
            readAt: expect.any(Date),
          }),
        }),
      );
    });

    it('does not set readAt when isRead is false', async () => {
      await service.update(messageId, { isRead: false });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isRead: false, readAt: undefined }),
        }),
      );
    });

    it('updates content when provided', async () => {
      await service.update(messageId, { content: 'Nội dung mới' });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'Nội dung mới' }),
        }),
      );
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes message and returns { deleted: true }', async () => {
      const result = await service.remove(messageId);

      expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: messageId } });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
