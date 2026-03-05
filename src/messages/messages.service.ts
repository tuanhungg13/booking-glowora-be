import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessageType, SenderType } from '@prisma/client';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMessageDto) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderType: dto.senderType,
        senderId: dto.senderId,
        content: dto.content,
        messageType: dto.messageType ?? MessageType.TEXT,
        telegramMsgId: dto.telegramMsgId,
      },
      include: { conversation: true },
    });
  }

  async findAll(conversationId: string, params?: { skip?: number; take?: number }) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        skip: params?.skip,
        take: params?.take ?? 50,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id },
      include: { conversation: true },
    });
    if (!msg) throw new NotFoundException('Message not found');
    return msg;
  }

  async update(id: string, dto: UpdateMessageDto) {
    await this.findOne(id);
    return this.prisma.message.update({
      where: { id },
      data: {
        content: dto.content,
        messageType: dto.messageType,
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
