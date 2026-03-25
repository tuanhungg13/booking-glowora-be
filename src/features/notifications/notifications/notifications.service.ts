import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        content: dto.content,
        isRead: dto.isRead ?? false,
      },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
  }

  async findAll(params?: {
    userId?: string;
    isRead?: boolean;
    type?: NotificationType;
    skip?: number;
    take?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params?.userId) where.userId = params.userId;
    if (params?.isRead !== undefined) where.isRead = params.isRead;
    if (params?.type) where.type = params.type;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!notif) throw new NotFoundException('Notification not found');
    return notif;
  }

  async update(id: string, dto: UpdateNotificationDto) {
    await this.findOne(id);
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: dto.isRead },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.notification.delete({ where: { id } });
    return { deleted: true };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: true };
  }
}
