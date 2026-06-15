import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallInStatus, DayOfWeek, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatGateway } from '../../../gateways/chat.gateway';
import { MailService } from '../../../mail/mail.service';
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
  private readonly logger = new Logger(StaffCallInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(storeId: string, staffId: string, dto: CreateStaffCallInDto) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId, status: 'ACTIVE' },
      include: { user: { select: { id: true, fullName: true, email: true } }, store: { select: { name: true } } },
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
    const notifBody = `${staff.store.name} mời bạn làm thêm ngày ${dateStr}${timeStr}${dto.note ? `. Ghi chú: ${dto.note}` : ''}`;
    const notif = await this.prisma.notification.create({
      data: {
        userId: staff.userId,
        callInId: callIn.id,
        type: NotificationType.STAFF_CALL_IN_REQUEST,
        title: 'Yêu cầu làm thêm',
        body: notifBody,
      },
    });
    this.gateway.emitToUser(staff.userId, 'notification_received', notif);

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const details = [
      { label: 'Cơ sở', value: staff.store.name },
      { label: 'Ngày làm', value: dateStr },
      { label: 'Giờ', value: dto.startTime && dto.endTime ? `${dto.startTime} – ${dto.endTime}` : 'Cả ngày' },
      ...(dto.note ? [{ label: 'Ghi chú', value: dto.note }] : []),
    ];
    this.mail.sendStaffNotification({
      email: staff.user.email,
      fullName: staff.user.fullName ?? staff.user.email,
      subject: `Lời mời làm thêm từ ${staff.store.name}`,
      body: notifBody,
      details,
      actionUrl: `${frontendUrl}/dashboard/my-schedule`,
      actionLabel: 'Xem và phản hồi lời mời',
    }).catch((err) => this.logger.error(`Failed to send call-in request email`, err));

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
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (ownerRole) {
      const dateStr = callIn.date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
      const isAccepted = action === RespondAction.ACCEPT;
      const notifBody = `${callIn.staff.user.fullName} đã ${isAccepted ? 'chấp nhận' : 'từ chối'} làm thêm ngày ${dateStr} tại ${callIn.store.name}`;
      const notif = await this.prisma.notification.create({
        data: {
          userId: ownerRole.userId,
          callInId: callIn.id,
          type: isAccepted ? NotificationType.STAFF_CALL_IN_ACCEPTED : NotificationType.STAFF_CALL_IN_REJECTED,
          title: isAccepted ? `${callIn.staff.user.fullName} đã chấp nhận` : `${callIn.staff.user.fullName} từ chối`,
          body: notifBody,
        },
      });
      this.gateway.emitToUser(ownerRole.userId, 'notification_received', notif);

      const details = [
        { label: 'Nhân viên', value: callIn.staff.user.fullName },
        { label: 'Ngày làm', value: dateStr },
        { label: 'Cơ sở', value: callIn.store.name },
      ];
      this.mail.sendStaffNotification({
        email: ownerRole.user.email,
        fullName: ownerRole.user.fullName ?? ownerRole.user.email,
        subject: isAccepted ? `${callIn.staff.user.fullName} đã chấp nhận ca làm thêm` : `${callIn.staff.user.fullName} từ chối ca làm thêm`,
        body: notifBody,
        details,
      }).catch((err) => this.logger.error(`Failed to send call-in respond email`, err));
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
