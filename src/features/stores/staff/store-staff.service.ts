import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, CallInStatus, DayOfWeek, DayOffStatus, NotificationType, StaffStatus, StoreStatus } from '@prisma/client';

const DOW_MAP: DayOfWeek[] = [
  DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY,
];
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionCacheService } from '../../../redis/permission-cache.service';
import { ChatGateway } from '../../../gateways/chat.gateway';
import { MailService } from '../../../mail/mail.service';
import { StoresService } from '../stores.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const STAFF_ROLE_CODE = 'SHOP_STAFF';
const INVITE_TTL_DAYS = 7;

const staffInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
  province: { select: { id: true, name: true, code: true, type: true } },
  ward: { select: { id: true, name: true, type: true, provinceId: true } },
} as const;

// Dùng cho endpoint public (không đăng nhập) — bỏ email/phone để không lộ PII nhân viên
// cho bất kỳ ai biết storeId.
const staffPublicInclude = {
  user: { select: { id: true, fullName: true, avatarUrl: true } },
} as const;

@Injectable()
export class StoreStaffService {
  private readonly logger = new Logger(StoreStaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storesService: StoresService,
    private readonly permissionCache: PermissionCacheService,
    private readonly mail: MailService,
    private readonly gateway: ChatGateway,
  ) {}

  async invite(storeId: string, ownerId: string, dto: InviteStaffDto) {
    const store = await this.storesService.checkOwnership(storeId, ownerId);

    if (store.status !== StoreStatus.ACTIVE) {
      throw new ForbiddenException('Chỉ cơ sở đã được kích hoạt mới có thể mời nhân viên');
    }

    const invitedUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!invitedUser) {
      throw new NotFoundException('Người dùng chưa đăng ký tài khoản trên hệ thống');
    }

    if (invitedUser.id === store.ownerId) {
      throw new ConflictException('Chủ cơ sở đã có quyền quản lý, không thể mời làm nhân viên');
    }

    const isAlreadyStaff = await this.prisma.staff.findFirst({
      where: { userId: invitedUser.id, storeId, status: StaffStatus.ACTIVE },
    });
    if (isAlreadyStaff) {
      throw new ConflictException('Người dùng đã là nhân viên của cơ sở này');
    }

    const now = new Date();

    const pendingInvite = await this.prisma.staffInvite.findFirst({
      where: { email: dto.email, storeId, status: 'PENDING', expiresAt: { gt: now } },
    });
    if (pendingInvite) {
      throw new ConflictException('Đã có lời mời đang chờ cho email này');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const existingInvite = await this.prisma.staffInvite.findFirst({
      where: { email: dto.email, storeId, status: { in: ['PENDING', 'EXPIRED'] } },
    });

    const invite = existingInvite
      ? await this.prisma.staffInvite.update({
          where: { id: existingInvite.id },
          data: { token, expiresAt, status: 'PENDING' },
        })
      : await this.prisma.staffInvite.create({
          data: { storeId, email: dto.email, token, expiresAt, status: 'PENDING' },
        });

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const inviteUrl = `${frontendUrl}/staff-invites/accept?token=${token}`;

    const notif = await this.prisma.notification.create({
      data: {
        userId: invitedUser.id,
        type: NotificationType.STAFF_INVITED,
        title: 'Lời mời nhân viên',
        body: `Bạn được mời làm nhân viên tại cơ sở "${store.name}". Kiểm tra email để nhận link kích hoạt.`,
      },
    });
    this.gateway.emitToUser(invitedUser.id, 'notification_received', notif);

    this.mail.sendStaffInvite({
      email: dto.email,
      fullName: invitedUser.fullName ?? dto.email,
      storeName: store.name,
      inviteUrl,
    }).catch((err) => this.logger.error(`Failed to send staff invite email to ${dto.email}`, err));

    return { invite };
  }

  async acceptInvite(dto: AcceptInviteDto, userId: string) {
    const invite = await this.prisma.staffInvite.findUnique({ where: { token: dto.token } });

    if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email !== invite.email) {
      throw new ForbiddenException('Token này không dành cho tài khoản của bạn');
    }

    const isAlreadyStaff = await this.prisma.staff.findFirst({
      where: { userId, storeId: invite.storeId, status: StaffStatus.ACTIVE },
    });
    if (isAlreadyStaff) {
      throw new ConflictException('Bạn đã là nhân viên của cơ sở này');
    }

    const staff = await this.prisma.$transaction(async (tx) => {
      // Dùng upsert để xử lý cả trường hợp staff đã từng bị DELETED (record cũ vẫn còn do soft delete)
      const upsertedStaff = await tx.staff.upsert({
        where: { userId_storeId: { userId, storeId: invite.storeId } },
        create: {
          userId,
          storeId: invite.storeId,
          status: StaffStatus.ACTIVE,
          phone: user.phone ?? null,
          address: user.address ?? null,
          provinceId: user.provinceId ?? null,
          wardId: user.wardId ?? null,
        },
        update: { status: StaffStatus.ACTIVE },
      });

      const staffRole = await tx.role.findFirst({
        where: { code: STAFF_ROLE_CODE, storeId: null },
        select: { id: true },
      });
      if (!staffRole) {
        throw new BadRequestException('SHOP_STAFF template role không tồn tại. Chạy seed trước.');
      }

      await tx.userRole.create({
        data: { userId, roleId: staffRole.id, storeId: invite.storeId },
      });

      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', staffId: upsertedStaff.id },
      });

      return tx.staff.findUniqueOrThrow({
        where: { id: upsertedStaff.id },
        include: staffInclude,
      });
    });

    await this.permissionCache.invalidateUser(userId);
    return this.mapStaff(staff);
  }

  async findAll(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
    const list = await this.prisma.staff.findMany({
      where: { storeId, status: { not: StaffStatus.DELETED } },
      orderBy: { createdAt: 'asc' },
      include: staffInclude,
    });
    return list.map((s) => ({ ...this.mapStaff(s), isOwner: s.userId === store?.ownerId }));
  }

  async findOne(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId, status: { not: StaffStatus.DELETED } },
      include: staffInclude,
    });
    if (!staff) throw new NotFoundException('Nhân viên không tồn tại trong cơ sở này');
    return this.mapStaff(staff);
  }

  async findAllPublic(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
    const list = await this.prisma.staff.findMany({
      where: { storeId, status: { not: StaffStatus.DELETED } },
      orderBy: { createdAt: 'asc' },
      include: staffPublicInclude,
    });
    return list.map((s) => ({ ...this.mapStaff(s), isOwner: s.userId === store?.ownerId }));
  }

  async findOnePublic(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId, status: { not: StaffStatus.DELETED } },
      include: staffPublicInclude,
    });
    if (!staff) throw new NotFoundException('Nhân viên không tồn tại trong cơ sở này');
    return this.mapStaff(staff);
  }

  async update(storeId: string, ownerId: string, staffId: string, dto: UpdateStaffDto) {
    await this.storesService.checkOwnership(storeId, ownerId);
    await this.findOne(storeId, staffId);
    return this.mapStaff(
      await this.prisma.staff.update({
        where: { id: staffId },
        data: dto,
        include: staffInclude,
      }),
    );
  }

  async remove(storeId: string, ownerId: string, staffId: string) {
    const store = await this.storesService.checkOwnership(storeId, ownerId);
    const staff = await this.findOne(storeId, staffId);

    if (staff.userId === store.ownerId) {
      throw new ForbiddenException('Không thể xóa chủ cơ sở khỏi danh sách nhân viên');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: staffId },
        data: { status: StaffStatus.DELETED },
      });
      await tx.userRole.deleteMany({
        where: { userId: staff.userId, storeId },
      });
    });

    await this.permissionCache.invalidateUser(staff.userId);
    return { removed: true };
  }


  private mapStaff(staff: any) {
    return staff;
  }

  /**
   * Tìm Staff ACTIVE của user trong store. Nếu không tìm thấy:
   * - Chủ shop: tự động khôi phục (upsert) Staff record về ACTIVE — xử lý store cũ tạo trước khi có auto-tạo Staff
   * - Không phải chủ shop: ném NotFoundException
   */
  private async findActiveStaffOrRestoreOwner(storeId: string, userId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { userId, storeId, status: StaffStatus.ACTIVE },
      include: staffInclude,
    });
    if (staff) return staff;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true },
    });
    if (store?.ownerId !== userId) {
      throw new NotFoundException('Bạn không phải nhân viên của cơ sở này');
    }

    return this.prisma.staff.upsert({
      where: { userId_storeId: { userId, storeId } },
      create: { userId, storeId, status: StaffStatus.ACTIVE },
      update: { status: StaffStatus.ACTIVE },
      include: staffInclude,
    });
  }

  async getCalendar(storeId: string, from: string, to: string) {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    const dateStr = (d: Date) => d.toISOString().split('T')[0];

    const staffList = await this.prisma.staff.findMany({
      where: { storeId, status: StaffStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        user: { select: { fullName: true } },
        schedules: {
          where: { isActive: true },
          select: { dayOfWeek: true, startTime: true, endTime: true, isActive: true },
        },
        dayOffs: {
          where: { date: { gte: fromDate, lte: toDate }, status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] } },
          select: { id: true, date: true, startTime: true, endTime: true, reason: true, status: true },
        },
        callIns: {
          where: { date: { gte: fromDate, lte: toDate } },
          select: { id: true, date: true, startTime: true, endTime: true, status: true, note: true },
        },
      },
    });

    return staffList.map((s) => ({
      staffId: s.id,
      staffName: s.user.fullName,
      schedules: s.schedules,
      dayOffs: s.dayOffs.map((d) => ({ ...d, date: dateStr(d.date) })),
      callIns: s.callIns.map((c) => ({ ...c, date: dateStr(c.date) })),
    }));
  }

  async getMyProfile(storeId: string, userId: string) {
    return this.findActiveStaffOrRestoreOwner(storeId, userId);
  }

  async getDailyTimeline(storeId: string, date: string, staffId?: string) {
    const dayStart  = new Date(`${date}T00:00:00.000Z`);
    const dayEnd    = new Date(`${date}T23:59:59.999Z`);
    const dayOfWeek = DOW_MAP[dayStart.getUTCDay()];

    const [store, staffList, bookings] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: {
          slotIntervalMins: true,
          workingHours: {
            where: { dayOfWeek },
            take: 1,
            select: { openTime: true, closeTime: true, isClosed: true },
          },
        },
      }),

      this.prisma.staff.findMany({
        where: { storeId, status: StaffStatus.ACTIVE, ...(staffId ? { id: staffId } : {}) },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          user: { select: { fullName: true } },
          schedules: {
            where: { dayOfWeek, isActive: true },
            select: { startTime: true, endTime: true },
          },
          dayOffs: {
            where: {
              date: { gte: dayStart, lte: dayEnd },
              status: { in: [DayOffStatus.PENDING, DayOffStatus.APPROVED] },
            },
            select: { reason: true, status: true, startTime: true, endTime: true },
          },
          callIns: {
            where: {
              date: { gte: dayStart, lte: dayEnd },
              status: { not: CallInStatus.REJECTED },
            },
            select: { startTime: true, endTime: true, status: true },
          },
        },
      }),

      this.prisma.booking.findMany({
        where: {
          storeId,
          scheduledAt: { gte: dayStart, lte: dayEnd },
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED] },
        },
        select: {
          id: true,
          status: true,
          customerName: true,
          items: {
            select: {
              id: true,
              staffId: true,
              startTime: true,
              duration: true,
              serviceName: true,
              service: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Build per-staff booking items map
    const itemsByStaff = new Map<string, {
      id: string; bookingId: string; bookingStatus: string;
      customerName: string | null; serviceName: string;
      startTime: string; duration: number;
    }[]>();

    for (const booking of bookings) {
      for (const item of booking.items) {
        if (!item.staffId) continue;
        const list = itemsByStaff.get(item.staffId) ?? [];
        list.push({
          id: item.id,
          bookingId: booking.id,
          bookingStatus: booking.status,
          customerName: booking.customerName,
          serviceName: item.service?.name ?? item.serviceName,
          startTime: item.startTime.toISOString(),
          duration: item.duration,
        });
        itemsByStaff.set(item.staffId, list);
      }
    }

    const staff = staffList.map((s) => {
      const schedule = s.schedules[0];
      const dayOff   = s.dayOffs[0];
      const callIn   = s.callIns[0];

      let state: string;
      let workStart: string | null = null;
      let workEnd: string | null   = null;
      let dayOffReason: string | null = null;

      if (dayOff) {
        state        = dayOff.status === DayOffStatus.APPROVED ? 'dayoff_approved' : 'dayoff_pending';
        dayOffReason = dayOff.reason;
        if (schedule) { workStart = schedule.startTime; workEnd = schedule.endTime; }
      } else if (callIn) {
        state     = callIn.status === CallInStatus.ACCEPTED ? 'callin_accepted' : 'callin_pending';
        workStart = callIn.startTime;
        workEnd   = callIn.endTime;
      } else if (schedule) {
        state     = 'working';
        workStart = schedule.startTime;
        workEnd   = schedule.endTime;
      } else {
        state = 'off';
      }

      return {
        staffId:      s.id,
        staffName:    s.user.fullName,
        state,
        workStart,
        workEnd,
        dayOffReason,
        bookingItems: itemsByStaff.get(s.id) ?? [],
      };
    });

    return {
      date,
      slotIntervalMins: store.slotIntervalMins,
      workingHour:      store.workingHours[0] ?? null,
      staff,
    };
  }
}
