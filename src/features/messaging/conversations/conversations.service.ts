import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

const conversationInclude = {
  customer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  store: true,
  _count: { select: { messages: true } },
} as const;

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
