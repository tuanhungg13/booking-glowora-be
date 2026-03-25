import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationStatus, Prisma } from '@prisma/client';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateConversationDto) {
    const hasStaff = Boolean(dto.staffId);
    return this.prisma.conversation.create({
      data: {
        customerId: dto.customerId,
        staffId: dto.staffId,
        appointmentId: dto.appointmentId,
        status: dto.status ?? ConversationStatus.OPEN,
        assignedAt: hasStaff ? new Date() : null,
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
    const existing = await this.prisma.conversation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Conversation not found');

    const data: Prisma.ConversationUpdateInput = {};
    if (dto.appointmentId !== undefined) {
      data.appointment = dto.appointmentId
        ? { connect: { id: dto.appointmentId } }
        : { disconnect: true };
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (dto.staffId !== undefined) {
      if (dto.staffId === null) {
        data.staff = { disconnect: true };
        data.assignedAt = null;
      } else {
        data.staff = { connect: { id: dto.staffId } };
        if (dto.staffId !== existing.staffId || !existing.assignedAt) {
          data.assignedAt = new Date();
        }
      }
    }

    return this.prisma.conversation.update({
      where: { id },
      data,
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
