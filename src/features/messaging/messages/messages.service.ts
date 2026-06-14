import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SenderType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId: dto.senderId,
          senderType: dto.senderType ?? SenderType.CUSTOMER,
          content: dto.content,
          isRead: dto.isRead ?? false,
        },
        include: { sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
      });
      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: {
          lastMessageAt: message.createdAt,
          lastMessageBody: dto.content.slice(0, 200),
        },
      });
      return message;
    });
  }

  async findAll(conversationId: string, params?: { skip?: number; take?: number }, requesterId?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { customerId: true, storeId: true, store: { select: { ownerId: true } } },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');

    if (requesterId) {
      const isCustomer = conversation.customerId === requesterId;
      const isOwner = conversation.store.ownerId === requesterId;
      if (!isCustomer && !isOwner) {
        const isStaff = await this.prisma.staff.findFirst({
          where: { userId: requesterId, storeId: conversation.storeId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!isStaff) throw new ForbiddenException();
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        skip: params?.skip,
        take: params?.take ?? 50,
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);
    return { items, total };
  }

  async findOne(id: string, requesterId?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        conversation: { include: { store: { select: { ownerId: true } } } },
        sender: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!message) throw new NotFoundException('Không tìm thấy tin nhắn');

    if (requesterId) {
      const conv = message.conversation;
      const isCustomer = conv.customerId === requesterId;
      const isOwner = (conv as any).store.ownerId === requesterId;
      if (!isCustomer && !isOwner) {
        const isStaff = await this.prisma.staff.findFirst({
          where: { userId: requesterId, storeId: conv.storeId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!isStaff) throw new ForbiddenException();
      }
    }

    return message;
  }

  async update(id: string, dto: UpdateMessageDto) {
    await this.findOne(id);
    return this.prisma.message.update({
      where: { id },
      data: {
        content: dto.content,
        isRead: dto.isRead,
        readAt: dto.isRead ? new Date() : undefined,
      },
      include: { conversation: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.message.delete({ where: { id } });
    return { deleted: true };
  }
}
