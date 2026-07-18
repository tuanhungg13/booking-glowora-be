import { Injectable, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatGateway } from '../../../gateways/chat.gateway';
import { MailProducerService } from '../../../mail/mail-producer.service';
import { RABBITMQ_CLIENT } from '../../../rabbitmq/rabbitmq.constants';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly mailProducer: MailProducerService,
    @Inject(RABBITMQ_CLIENT.NOTIFICATIONS_PUSH) private readonly pushClient: ClientProxy,
  ) { }

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        bookingId: dto.bookingId,
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
    if (!notif) throw new NotFoundException('Không tìm thấy thông báo');
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
    if (!notif) throw new NotFoundException('Không tìm thấy thông báo');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  // ─── Booking lifecycle notifications ─────────────────────────────────────

  async notifyBookingCreated(params: {
    bookingId: string;
    storeId: string;
    storeName: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    serviceNames: string;
    scheduledAt: Date;
  }) {
    const { bookingId, storeId, storeName, customerId, customerName, customerEmail, serviceNames, scheduledAt } = params;
    const timeStr = this.formatDateTime(scheduledAt);
    const displayName = customerName ?? 'Khách vãng lai';

    const ownerRole = await this.prisma.userRole.findFirst({
      where: { storeId, role: { code: 'SHOP_OWNER' } },
    });

    // owner + customer là 2 insert độc lập — chạy song song (thay vì await tuần tự từng cái)
    // để rút ngắn wall time dưới tải cao; push subscription của cả 2 cũng gộp thành 1 query
    // (xem WebPushService.sendToUsers) thay vì 2 query riêng.
    const [ownerNotif, customerNotif] = await Promise.all([
      ownerRole
        ? this.prisma.notification.create({
          data: {
            userId: ownerRole.userId,
            bookingId,
            type: NotificationType.BOOKING_CREATED,
            title: `Lịch hẹn mới tại ${storeName}`,
            body: `${displayName} đã đặt ${serviceNames} vào ${timeStr}`,
          },
        })
        : Promise.resolve(null),
      customerId
        ? this.prisma.notification.create({
          data: {
            userId: customerId,
            bookingId,
            type: NotificationType.BOOKING_CREATED,
            title: 'Đặt lịch thành công',
            body: `Lịch hẹn ${serviceNames} tại ${storeName} vào ${timeStr} đang chờ xác nhận.`,
          },
        })
        : Promise.resolve(null),
    ]);

    const pushItems: Array<{ userId: string; title: string; body: string; data: Record<string, unknown> }> = [];
    if (ownerNotif) {
      this.gateway.emitToUser(ownerRole!.userId, 'notification_received', ownerNotif);
      pushItems.push({ userId: ownerRole!.userId, title: ownerNotif.title, body: ownerNotif.body, data: { bookingId } });
    }
    if (customerNotif) {
      this.gateway.emitToUser(customerId!, 'notification_received', customerNotif);
      pushItems.push({ userId: customerId!, title: customerNotif.title, body: customerNotif.body, data: { bookingId } });
    }
    this.pushMany(pushItems);

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: displayName,
        storeName,
        serviceNames,
        scheduledAt: timeStr,
        eventType: 'CREATED',
      });
    }
  }

  async notifyBookingConfirmed(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    storeName: string;
    serviceNames: string;
    scheduledAt: Date;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames, scheduledAt } = params;
    if (!customerId) return;
    const timeStr = this.formatDateTime(scheduledAt);

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Lịch hẹn đã được xác nhận',
        body: `Lịch hẹn ${serviceNames} tại ${storeName} vào ${timeStr} đã được xác nhận.`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        scheduledAt: timeStr,
        eventType: 'CONFIRMED',
      });
    }
  }

  async notifyBookingRejected(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    storeName: string;
    serviceNames: string;
    reason: string;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames, reason } = params;
    if (!customerId) return;

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_REJECTED,
        title: 'Lịch hẹn chưa được xác nhận',
        body: `Lịch hẹn ${serviceNames} tại ${storeName} bị từ chối. Lý do: ${reason}`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        reason,
        eventType: 'REJECTED',
      });
    }
  }

  async notifyBookingCompleted(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    storeName: string;
    serviceNames: string;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames } = params;
    if (!customerId) return;

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_COMPLETED,
        title: 'Cảm ơn bạn đã sử dụng dịch vụ',
        body: `${serviceNames} tại ${storeName} đã hoàn thành. Hãy để lại đánh giá nhé!`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        eventType: 'COMPLETED',
      });
    }
  }

  async notifyBookingCancelled(params: {
    bookingId: string;
    storeId: string;
    storeName: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    serviceNames: string;
    reason?: string;
  }) {
    const { bookingId, storeId, storeName, customerId, customerName, customerEmail, serviceNames, reason } = params;
    const displayName = customerName ?? 'Khách vãng lai';

    const ownerRole = await this.prisma.userRole.findFirst({
      where: { storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      const ownerNotif = await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          bookingId,
          type: NotificationType.BOOKING_CANCELLED,
          title: 'Lịch hẹn đã bị hủy',
          body: `${displayName} đã hủy lịch hẹn ${serviceNames}.${reason ? ` Lý do: ${reason}` : ''}`,
        },
      });
      this.gateway.emitToUser(ownerRole.userId, 'notification_received', ownerNotif);
      this.push(ownerRole.userId, ownerNotif.title, ownerNotif.body, { bookingId });
    }

    if (customerId) {
      const customerNotif = await this.prisma.notification.create({
        data: {
          userId: customerId,
          bookingId,
          type: NotificationType.BOOKING_CANCELLED,
          title: 'Lịch hẹn đã bị hủy',
          body: `Lịch hẹn ${serviceNames} tại ${storeName} đã được hủy.`,
        },
      });
      this.gateway.emitToUser(customerId, 'notification_received', customerNotif);
      this.push(customerId, customerNotif.title, customerNotif.body, { bookingId });
    }

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: displayName,
        storeName,
        serviceNames,
        reason,
        eventType: 'CANCELLED',
      });
    }
  }

  async notifyPaymentSuccess(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    amount: number;
    storeName: string;
    serviceNames: string;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames, amount } = params;
    if (!customerId) return;
    const formattedAmount = amount.toLocaleString('vi-VN');

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.PAYMENT_SUCCESS,
        title: 'Thanh toán thành công',
        body: `Bạn đã thanh toán ${formattedAmount}₫ cho ${serviceNames} tại ${storeName}.`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        amount: `${formattedAmount}₫`,
        eventType: 'PAYMENT_SUCCESS',
      });
    }
  }

  async notifyDepositReminder(params: {
    bookingId: string;
    customerId: string;
    storeName: string;
    serviceNames: string;
    depositAmount: number;
    depositDeadline: Date;
  }) {
    const { bookingId, customerId, storeName, serviceNames, depositAmount, depositDeadline } = params;
    const deadlineStr = this.formatDateTime(depositDeadline);
    const formattedAmount = depositAmount.toLocaleString('vi-VN');
    const title = 'Nhắc nhở: Còn 30 phút để thanh toán cọc';
    const body = `Vui lòng thanh toán cọc ${formattedAmount}₫ cho ${serviceNames} tại ${storeName} trước ${deadlineStr}.`;

    // Chỉ web push — không lưu DB, không email
    this.push(customerId, title, body, { bookingId });
  }

  async notifyDepositRequired(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    storeName: string;
    serviceNames: string;
    scheduledAt: Date;
    depositAmount: number;
    depositDeadline: Date;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames, scheduledAt, depositAmount, depositDeadline } = params;
    if (!customerId) return;
    const timeStr = this.formatDateTime(scheduledAt);
    const deadlineStr = this.formatDateTime(depositDeadline);
    const formattedAmount = depositAmount.toLocaleString('vi-VN');

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_DEPOSIT_REQUIRED,
        title: 'Cần thanh toán tiền cọc',
        body: `Lịch hẹn ${serviceNames} tại ${storeName} vào ${timeStr} đã được xác nhận. Vui lòng thanh toán cọc ${formattedAmount}₫ trước ${deadlineStr}.`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        scheduledAt: timeStr,
        amount: `${formattedAmount}₫`,
        depositDeadline: deadlineStr,
        eventType: 'DEPOSIT_REQUIRED',
      });
    }
  }

  async notifyDepositPaid(params: {
    bookingId: string;
    storeId: string;
    storeName: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    serviceNames: string;
    depositAmount: number;
  }) {
    const { bookingId, storeId, storeName, customerId, customerName, customerEmail, serviceNames, depositAmount } = params;
    const formattedAmount = depositAmount.toLocaleString('vi-VN');
    const displayName = customerName ?? 'Khách vãng lai';

    const ownerRole = await this.prisma.userRole.findFirst({
      where: { storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      const ownerNotif = await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          bookingId,
          type: NotificationType.BOOKING_DEPOSIT_PAID,
          title: 'Khách đã thanh toán tiền cọc',
          body: `${displayName} đã đặt cọc ${formattedAmount}₫ cho lịch hẹn ${serviceNames}.`,
        },
      });
      this.gateway.emitToUser(ownerRole.userId, 'notification_received', ownerNotif);
      this.push(ownerRole.userId, ownerNotif.title, ownerNotif.body, { bookingId });
    }

    if (customerId) {
      const customerNotif = await this.prisma.notification.create({
        data: {
          userId: customerId,
          bookingId,
          type: NotificationType.BOOKING_DEPOSIT_PAID,
          title: 'Đặt cọc thành công',
          body: `Bạn đã đặt cọc ${formattedAmount}₫ cho ${serviceNames} tại ${storeName}. Lịch hẹn của bạn đã được giữ chỗ.`,
        },
      });
      this.gateway.emitToUser(customerId, 'notification_received', customerNotif);
      this.push(customerId, customerNotif.title, customerNotif.body, { bookingId });
    }

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: displayName,
        storeName,
        serviceNames,
        amount: `${formattedAmount}₫`,
        eventType: 'DEPOSIT_PAID',
      });
    }
  }

  async notifyDepositExpired(params: {
    bookingId: string;
    storeId: string;
    storeName: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    serviceNames: string;
  }) {
    const { bookingId, storeId, storeName, customerId, customerName, customerEmail, serviceNames } = params;
    const displayName = customerName ?? 'Khách vãng lai';

    const ownerRole = await this.prisma.userRole.findFirst({
      where: { storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      const ownerNotif = await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          bookingId,
          type: NotificationType.BOOKING_DEPOSIT_EXPIRED,
          title: 'Lịch hẹn bị hủy do không cọc đúng hạn',
          body: `${displayName} không thanh toán cọc đúng hạn. Lịch hẹn ${serviceNames} đã được hủy tự động.`,
        },
      });
      this.gateway.emitToUser(ownerRole.userId, 'notification_received', ownerNotif);
      this.push(ownerRole.userId, ownerNotif.title, ownerNotif.body, { bookingId });
    }

    if (customerId) {
      const customerNotif = await this.prisma.notification.create({
        data: {
          userId: customerId,
          bookingId,
          type: NotificationType.BOOKING_DEPOSIT_EXPIRED,
          title: 'Lịch hẹn đã bị hủy',
          body: `Lịch hẹn ${serviceNames} tại ${storeName} đã bị hủy do bạn không thanh toán tiền cọc đúng hạn.`,
        },
      });
      this.gateway.emitToUser(customerId, 'notification_received', customerNotif);
      this.push(customerId, customerNotif.title, customerNotif.body, { bookingId });
    }

    if (customerEmail) {
      this.mailProducer.sendBookingEvent({
        email: customerEmail,
        fullName: displayName,
        storeName,
        serviceNames,
        eventType: 'CANCELLED',
      });
    }
  }

  async notifyBookingReminder1Day(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    storeName: string;
    serviceNames: string;
    scheduledAt: Date;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames, scheduledAt } = params;
    if (!customerId) return;
    const timeStr = this.formatDateTime(scheduledAt);

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_REMINDER_1DAY,
        title: 'Nhắc nhở: Lịch hẹn của bạn vào ngày mai',
        body: `${serviceNames} tại ${storeName} vào ${timeStr}. Đừng quên nhé!`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingReminder({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        scheduledAt: timeStr,
        isOneDayReminder: true,
      });
    }
  }

  async notifyBookingReminder1Hour(params: {
    bookingId: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    storeName: string;
    serviceNames: string;
    scheduledAt: Date;
  }) {
    const { bookingId, customerId, customerEmail, customerName, storeName, serviceNames, scheduledAt } = params;
    if (!customerId) return;
    const timeStr = this.formatDateTime(scheduledAt);

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_REMINDER_1HOUR,
        title: 'Nhắc nhở: Lịch hẹn của bạn sau 1 giờ nữa',
        body: `${serviceNames} tại ${storeName} vào ${timeStr}. Chuẩn bị sẵn sàng nhé!`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendBookingReminder({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        storeName,
        serviceNames,
        scheduledAt: timeStr,
        isOneDayReminder: false,
      });
    }
  }

  async notifyStaffChanged(params: {
    bookingId: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    storeName: string;
    serviceName: string;
    newStaffName: string;
    scheduledAt: Date;
  }) {
    const { bookingId, customerId, customerName, customerEmail, storeName, serviceName, newStaffName, scheduledAt } = params;
    if (!customerId) return;
    const timeStr = this.formatDateTime(scheduledAt);

    const notif = await this.prisma.notification.create({
      data: {
        userId: customerId,
        bookingId,
        type: NotificationType.BOOKING_STAFF_CHANGED,
        title: 'Nhân viên thực hiện dịch vụ đã thay đổi',
        body: `Dịch vụ ${serviceName} tại ${storeName} vào ${timeStr} sẽ được thực hiện bởi ${newStaffName}.`,
      },
    });
    this.gateway.emitToUser(customerId, 'notification_received', notif);
    this.push(customerId, notif.title, notif.body, { bookingId });

    if (customerEmail) {
      this.mailProducer.sendStaffNotification({
        email: customerEmail,
        fullName: customerName ?? customerEmail,
        subject: `Nhân viên thực hiện dịch vụ đã thay đổi`,
        body: `Dịch vụ ${serviceName} tại ${storeName} vào ${timeStr} sẽ được thực hiện bởi ${newStaffName}.`,
        details: [
          { label: 'Dịch vụ', value: serviceName },
          { label: 'Nhân viên mới', value: newStaffName },
          { label: 'Thời gian', value: timeStr },
          { label: 'Cơ sở', value: storeName },
        ],
      });
    }
  }

  private push(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    this.pushClient.emit('push.send-to-user', { userId, title, body, data }).subscribe({
      error: (err: Error) => this.logger.warn(`Web push publish failed for user ${userId}: ${err?.message}`),
    });
  }

  private pushMany(items: Array<{ userId: string; title: string; body: string; data?: Record<string, unknown> }>) {
    if (items.length === 0) return;
    this.pushClient.emit('push.send-to-users', items).subscribe({
      error: (err: Error) => this.logger.warn(`Web push publish (batch) failed: ${err?.message}`),
    });
  }

  // Offset UTC → UTC+7 thủ công để không phụ thuộc vào ICU locale của server
  private formatDateTime(date: Date): string {
    const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
  }
}
