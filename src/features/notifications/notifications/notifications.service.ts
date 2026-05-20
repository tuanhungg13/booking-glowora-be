import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        appointmentId: dto.appointmentId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
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

  async markOneAsRead(id: string, userId: string) {
    const notif = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  // --- Appointment lifecycle notifications ---

  async notifyAppointmentCreated(params: {
    appointmentId: string;
    storeId: string;
    storeName: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    serviceName: string;
    scheduledAt: Date;
  }) {
    const { appointmentId, storeId, storeName, customerId, customerName, customerEmail, serviceName, scheduledAt } = params;
    const timeStr = this.formatDateTime(scheduledAt);

    // Notify store owner
    const ownerRole = await this.prisma.userRole.findFirst({
      where: { shopId: storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          appointmentId,
          type: NotificationType.APPOINTMENT_CREATED,
          title: `Lịch hẹn mới tại ${storeName}`,
          body: `${customerName} đã đặt dịch vụ ${serviceName} vào ${timeStr}`,
        },
      });
    }

    // Notify customer
    await this.prisma.notification.create({
      data: {
        userId: customerId,
        appointmentId,
        type: NotificationType.APPOINTMENT_CREATED,
        title: 'Đặt lịch thành công',
        body: `Lịch hẹn dịch vụ ${serviceName} tại ${storeName} vào ${timeStr} đang chờ xác nhận.`,
      },
    });

    console.log(`[EMAIL] To: ${customerEmail} | Subject: Xác nhận đặt lịch tại ${storeName}`);
  }

  async notifyAppointmentConfirmed(params: {
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    storeName: string;
    serviceName: string;
    scheduledAt: Date;
  }) {
    const { appointmentId, customerId, customerEmail, storeName, serviceName, scheduledAt } = params;
    const timeStr = this.formatDateTime(scheduledAt);

    await this.prisma.notification.create({
      data: {
        userId: customerId,
        appointmentId,
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Lịch hẹn đã được xác nhận',
        body: `Lịch hẹn dịch vụ ${serviceName} tại ${storeName} vào ${timeStr} đã được xác nhận.`,
      },
    });

    console.log(`[EMAIL] To: ${customerEmail} | Subject: Lịch hẹn đã được xác nhận tại ${storeName}`);
  }

  async notifyAppointmentRejected(params: {
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    storeName: string;
    serviceName: string;
    reason: string;
  }) {
    const { appointmentId, customerId, customerEmail, storeName, serviceName, reason } = params;

    await this.prisma.notification.create({
      data: {
        userId: customerId,
        appointmentId,
        type: NotificationType.APPOINTMENT_REJECTED,
        title: 'Lịch hẹn chưa được xác nhận',
        body: `Lịch hẹn dịch vụ ${serviceName} tại ${storeName} bị từ chối. Lý do: ${reason}`,
      },
    });

    console.log(`[EMAIL] To: ${customerEmail} | Subject: Lịch hẹn chưa được xác nhận tại ${storeName}`);
  }

  async notifyAppointmentCompleted(params: {
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    storeName: string;
    serviceName: string;
  }) {
    const { appointmentId, customerId, customerEmail, storeName, serviceName } = params;

    await this.prisma.notification.create({
      data: {
        userId: customerId,
        appointmentId,
        type: NotificationType.APPOINTMENT_COMPLETED,
        title: 'Cảm ơn bạn đã sử dụng dịch vụ',
        body: `Dịch vụ ${serviceName} tại ${storeName} đã hoàn thành. Hãy để lại đánh giá nhé!`,
      },
    });

    console.log(`[EMAIL] To: ${customerEmail} | Subject: Cảm ơn bạn đã sử dụng dịch vụ tại ${storeName}`);
  }

  async notifyAppointmentCancelled(params: {
    appointmentId: string;
    storeId: string;
    storeName: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    serviceName: string;
    reason?: string;
  }) {
    const { appointmentId, storeId, storeName, customerId, customerName, customerEmail, serviceName, reason } = params;

    // Notify store owner
    const ownerRole = await this.prisma.userRole.findFirst({
      where: { shopId: storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          appointmentId,
          type: NotificationType.APPOINTMENT_CANCELLED,
          title: 'Khách đã hủy lịch hẹn',
          body: `${customerName} đã hủy lịch hẹn dịch vụ ${serviceName}.${reason ? ` Lý do: ${reason}` : ''}`,
        },
      });
    }

    // Notify customer
    await this.prisma.notification.create({
      data: {
        userId: customerId,
        appointmentId,
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Lịch hẹn đã bị hủy',
        body: `Lịch hẹn dịch vụ ${serviceName} tại ${storeName} đã được hủy.`,
      },
    });

    console.log(`[EMAIL] To: ${customerEmail} | Subject: Lịch hẹn tại ${storeName} đã bị hủy`);
  }

  async notifyPaymentSuccess(params: {
    appointmentId: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    amount: number;
    storeName: string;
    serviceName: string;
  }) {
    const { appointmentId, customerId, customerEmail, storeName, serviceName, amount } = params;
    const formattedAmount = amount.toLocaleString('vi-VN');

    await this.prisma.notification.create({
      data: {
        userId: customerId,
        appointmentId,
        type: NotificationType.PAYMENT_SUCCESS,
        title: 'Thanh toán thành công',
        body: `Bạn đã thanh toán ${formattedAmount}₫ cho dịch vụ ${serviceName} tại ${storeName}.`,
      },
    });

    console.log(`[EMAIL] To: ${customerEmail} | Subject: Xác nhận thanh toán thành công tại ${storeName}`);
  }

  private formatDateTime(date: Date): string {
    const d = date.toISOString();
    return d.replace('T', ' ').substring(0, 16);
  }
}
