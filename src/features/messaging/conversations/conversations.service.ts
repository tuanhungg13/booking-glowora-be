import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationStatus } from '@prisma/client';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        customerId: dto.customerId,
        staffId: dto.staffId,
        appointmentId: dto.appointmentId,
        status: dto.status ?? ConversationStatus.OPEN,
      },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        staff: { select: { id: true, fullName: true, email: true } },
        appointment: true,
      },
    });
  }

  async findAll(params?: {
    status?: ConversationStatus;
    customerId?: string;
    staffId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params?.status) where.status = params.status;
    if (params?.customerId) where.customerId = params.customerId;
    if (params?.staffId) where.staffId = params.staffId;
    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { updatedAt: 'desc' },
        include: {
          customer: { select: { id: true, fullName: true, email: true } },
          staff: { select: { id: true, fullName: true, email: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        staff: { select: { id: true, fullName: true, email: true } },
        appointment: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async update(id: string, dto: UpdateConversationDto) {
    await this.findOne(id);
    return this.prisma.conversation.update({
      where: { id },
      data: { staffId: dto.staffId, appointmentId: dto.appointmentId, status: dto.status },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        staff: { select: { id: true, fullName: true, email: true } },
        appointment: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.conversation.delete({ where: { id } });
    return { deleted: true };
  }
}
