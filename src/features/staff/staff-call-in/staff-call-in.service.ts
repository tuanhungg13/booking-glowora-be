import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CallInStatus, DayOfWeek, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatGateway } from '../../../gateways/chat.gateway';
import { vnTodayStr } from '../../../common/utils/date.util';
import { CreateStaffCallInDto } from './dto/create-staff-call-in.dto';
import { RespondAction } from './dto/respond-staff-call-in.dto';

const DOW_MAP: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

const callInInclude = {
  staff: { include: { user: { select: { id: true, fullName: true, email: true } } } },
  store: { select: { id: true, name: true } },
} as const;

@Injectable()
export class StaffCallInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
  ) {}

  async create(storeId: string, staffId: string, dto: CreateStaffCallInDto) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId },
      include: { user: { select: { id: true, fullName: true } }, store: { select: { name: true } } },
    });
    if (!staff) throw new NotFoundException('Nhân viên không thuộc cửa hàng này');

    if (dto.date < vnTodayStr()) {
      throw new BadRequestException('Không thể gọi đi làm cho ngày đã qua');
    }

    const dateUTC = new Date(dto.date);
    const dayOfWeek = DOW_MAP[dateUTC.getUTCDay()];

    // Kiểm tra ngày phải thực sự trống (không có schedule active + không có day-off)
    const [activeSchedule, dayOff] = await Promise.all([
      this.prisma.staffSchedule.findFirst({ where: { staffId, dayOfWeek, isActive: true } }),
      this.prisma.staffDayOff.findFirst({ where: { staffId, date: dateUTC } }),
    ]);

    if (activeSchedule) {
      throw new BadRequestException('Nhân viên đã có lịch làm việc ngày này trong tuần');
    }
    if (dayOff) {
      throw new BadRequestException('Nhân viên đã đăng ký nghỉ ngày này');
    }

    const existing = await this.prisma.staffCallIn.findFirst({ where: { staffId, date: dateUTC } });
    if (existing) {
      throw new BadRequestException('Đã có yêu cầu gọi đi làm cho ngày này');
    }

    const callIn = await this.prisma.staffCallIn.create({
      data: { storeId, staffId, date: dateUTC, startTime: dto.startTime, endTime: dto.endTime, note: dto.note },
      include: callInInclude,
    });

    // Gửi notification cho nhân viên
    const dateStr = dateUTC.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    const timeStr = dto.startTime && dto.endTime ? ` (${dto.startTime}–${dto.endTime})` : '';
    const notif = await this.prisma.notification.create({
      data: {
        userId: staff.userId,
        callInId: callIn.id,
        type: NotificationType.STAFF_CALL_IN_REQUEST,
        title: 'Yêu cầu làm thêm',
        body: `${staff.store.name} mời bạn làm thêm ngày ${dateStr}${timeStr}${dto.note ? `. Ghi chú: ${dto.note}` : ''}`,
      },
    });
    this.gateway.emitToUser(staff.userId, 'notification_received', notif);

    return callIn;
  }

  async findAll(storeId: string, staffId: string, params?: { from?: Date; to?: Date; status?: CallInStatus }) {
    await this.assertStaffInStore(storeId, staffId);
    return this.prisma.staffCallIn.findMany({
      where: {
        storeId,
        staffId,
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.from || params?.to
          ? { date: { ...(params.from && { gte: params.from }), ...(params.to && { lte: params.to }) } }
          : {}),
      },
      orderBy: { date: 'asc' },
      include: callInInclude,
    });
  }

  async respond(staffId: string, callInId: string, callerUserId: string, action: RespondAction) {
    const callIn = await this.prisma.staffCallIn.findFirst({
      where: { id: callInId, staffId },
      include: {
        staff: { include: { user: { select: { id: true, fullName: true } } } },
        store: { select: { id: true, name: true } },
      },
    });
    if (!callIn) throw new NotFoundException('Không tìm thấy yêu cầu');

    // Chỉ chính nhân viên đó mới được respond
    if (callIn.staff.userId !== callerUserId) {
      throw new ForbiddenException('Chỉ nhân viên được gọi mới có thể phản hồi');
    }

    if (callIn.status !== CallInStatus.PENDING) {
      throw new BadRequestException('Yêu cầu đã được phản hồi trước đó');
    }

    const newStatus = action === RespondAction.ACCEPT ? CallInStatus.ACCEPTED : CallInStatus.REJECTED;
    const updated = await this.prisma.staffCallIn.update({
      where: { id: callInId },
      data: { status: newStatus },
      include: callInInclude,
    });

    // Gửi notification cho manager
    const ownerRole = await this.prisma.userRole.findFirst({
      where: { storeId: callIn.storeId, role: { code: 'SHOP_OWNER' } },
    });
    if (ownerRole) {
      const dateStr = callIn.date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
      const isAccepted = action === RespondAction.ACCEPT;
      const notif = await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          callInId: callIn.id,
          type: isAccepted ? NotificationType.STAFF_CALL_IN_ACCEPTED : NotificationType.STAFF_CALL_IN_REJECTED,
          title: isAccepted ? `${callIn.staff.user.fullName} đã chấp nhận` : `${callIn.staff.user.fullName} từ chối`,
          body: `${callIn.staff.user.fullName} đã ${isAccepted ? 'chấp nhận' : 'từ chối'} làm thêm ngày ${dateStr} tại ${callIn.store.name}`,
        },
      });
      this.gateway.emitToUser(ownerRole.userId, 'notification_received', notif);
    }

    return updated;
  }

  async remove(storeId: string, staffId: string, callInId: string) {
    const callIn = await this.prisma.staffCallIn.findFirst({ where: { id: callInId, storeId, staffId } });
    if (!callIn) throw new NotFoundException('Không tìm thấy yêu cầu');
    if (callIn.status !== CallInStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy yêu cầu đang ở trạng thái chờ');
    }
    await this.prisma.staffCallIn.delete({ where: { id: callInId } });
    return { deleted: true };
  }

  private async assertStaffInStore(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, storeId }, select: { id: true } });
    if (!staff) throw new NotFoundException('Nhân viên không thuộc cửa hàng này');
  }
}
