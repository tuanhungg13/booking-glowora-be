import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DayOffStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatGateway } from '../../../gateways/chat.gateway';
import { vnTodayStr } from '../../../common/utils/date.util';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';
import { DayOffReviewAction } from './dto/review-staff-day-off.dto';

const dayOffInclude = {
  staff: { include: { user: { select: { id: true, fullName: true, email: true } } } },
} as const;

@Injectable()
export class StaffDayOffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
  ) {}

  async create(storeId: string, staffId: string, dto: CreateStaffDayOffDto) {
    await this.assertStaffInStore(storeId, staffId);
    if (dto.date < vnTodayStr()) {
      throw new BadRequestException('Ngày nghỉ phải là hôm nay hoặc tương lai');
    }
    if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime)) {
      throw new BadRequestException('Phải cung cấp cả startTime và endTime hoặc không cung cấp cả hai');
    }

    const date = new Date(dto.date);
    const existing = await this.prisma.staffDayOff.findFirst({ where: { storeId, staffId, date } });
    if (existing) {
      throw new BadRequestException('Đã đăng ký nghỉ ngày này');
    }

    const dayOff = await this.prisma.staffDayOff.create({
      data: {
        storeId,
        staffId,
        date,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason,
        status: DayOffStatus.PENDING,
      },
      include: {
        ...dayOffInclude,
        staff: { include: { user: { select: { id: true, fullName: true, email: true } }, store: { select: { name: true } } } },
      },
    });

    // Gửi notification cho chủ cửa hàng
    const ownerRole = await this.prisma.userRole.findFirst({
      where: { storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
      const timeStr = dto.startTime && dto.endTime ? ` (${dto.startTime}–${dto.endTime})` : ' (cả ngày)';
      const notif = await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          dayOffId: dayOff.id,
          type: NotificationType.STAFF_DAY_OFF_REQUEST,
          title: 'Yêu cầu nghỉ phép',
          body: `${dayOff.staff.user.fullName} xin nghỉ ngày ${dateStr}${timeStr}${dto.reason ? `. Lý do: ${dto.reason}` : ''}`,
        },
      });
      this.gateway.emitToUser(ownerRole.userId, 'notification_received', notif);
    }

    return dayOff;
  }

  async review(id: string, storeId: string, staffId: string, reviewerUserId: string, action: DayOffReviewAction, note?: string) {
    const dayOff = await this.findOne(id, storeId, staffId);
    if (dayOff.status !== DayOffStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể duyệt yêu cầu đang chờ xử lý');
    }

    const newStatus = action === DayOffReviewAction.APPROVE ? DayOffStatus.APPROVED : DayOffStatus.REJECTED;

    const updated = await this.prisma.staffDayOff.update({
      where: { id },
      data: { status: newStatus, reviewedBy: reviewerUserId, reviewedAt: new Date(), reviewNote: note ?? null },
      include: {
        ...dayOffInclude,
        staff: { include: { user: { select: { id: true, fullName: true, email: true } }, store: { select: { name: true } } } },
      },
    });

    // Gửi notification cho nhân viên
    const isApproved = action === DayOffReviewAction.APPROVE;
    const dateStr = updated.date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    const notif = await this.prisma.notification.create({
      data: {
        userId: updated.staff.user.id,
        dayOffId: id,
        type: isApproved ? NotificationType.STAFF_DAY_OFF_APPROVED : NotificationType.STAFF_DAY_OFF_REJECTED,
        title: isApproved ? 'Nghỉ phép đã được duyệt' : 'Nghỉ phép bị từ chối',
        body: `Yêu cầu nghỉ ngày ${dateStr} tại ${updated.staff.store.name} đã ${isApproved ? 'được duyệt' : 'bị từ chối'}${note ? `. Ghi chú: ${note}` : ''}`,
      },
    });
    this.gateway.emitToUser(updated.staff.user.id, 'notification_received', notif);

    return updated;
  }

  async findAll(storeId: string, staffId: string, params?: { from?: Date; to?: Date; status?: DayOffStatus }) {
    return this.prisma.staffDayOff.findMany({
      where: {
        storeId,
        staffId,
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.from || params?.to
          ? { date: { ...(params.from && { gte: params.from }), ...(params.to && { lte: params.to }) } }
          : {}),
      },
      orderBy: { date: 'asc' },
      include: dayOffInclude,
    });
  }

  async findOne(id: string, storeId?: string, staffId?: string) {
    const dayOff = await this.prisma.staffDayOff.findFirst({
      where: { id, ...(storeId && { storeId }), ...(staffId && { staffId }) },
      include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } }, store: { select: { name: true } } } } },
    });
    if (!dayOff) throw new NotFoundException('Không tìm thấy ngày nghỉ');
    return dayOff;
  }

  async update(id: string, storeId: string, staffId: string, dto: UpdateStaffDayOffDto) {
    const dayOff = await this.findOne(id, storeId, staffId);
    if (dayOff.status !== DayOffStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể chỉnh sửa yêu cầu đang chờ duyệt');
    }
    if (dto.date && dto.date < vnTodayStr()) {
      throw new BadRequestException('Ngày nghỉ phải là hôm nay hoặc tương lai');
    }
    if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime)) {
      throw new BadRequestException('Phải cung cấp cả startTime và endTime hoặc không cung cấp cả hai');
    }
    return this.prisma.staffDayOff.update({
      where: { id },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason,
      },
      include: dayOffInclude,
    });
  }

  async remove(id: string, storeId: string, staffId: string) {
    const dayOff = await this.findOne(id, storeId, staffId);
    if (dayOff.status === DayOffStatus.APPROVED) {
      throw new BadRequestException('Không thể hủy ngày nghỉ đã được duyệt');
    }
    await this.prisma.staffDayOff.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertStaffInStore(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, storeId }, select: { id: true } });
    if (!staff) throw new NotFoundException('Nhân viên không thuộc cửa hàng này');
  }
}
