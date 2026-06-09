import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOffStatus, NotificationType, StaffStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionCacheService } from '../../../redis/permission-cache.service';
import { StoresService } from '../stores.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const STAFF_ROLE_CODE = 'SHOP_STAFF';
const INVITE_TTL_DAYS = 7;

const staffInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
  services: { include: { service: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class StoreStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storesService: StoresService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async invite(storeId: string, ownerId: string, dto: InviteStaffDto) {
    await this.storesService.checkOwnership(storeId, ownerId);

    const invitedUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!invitedUser) {
      throw new NotFoundException('Người dùng chưa đăng ký tài khoản trên hệ thống');
    }

    const isAlreadyStaff = await this.prisma.staff.findFirst({
      where: { userId: invitedUser.id, storeId, status: StaffStatus.ACTIVE },
    });
    if (isAlreadyStaff) {
      throw new ConflictException('Người dùng đã là nhân viên của cơ sở này');
    }

    const pendingInvite = await this.prisma.staffInvite.findFirst({
      where: { email: dto.email, storeId, status: 'PENDING' },
    });
    if (pendingInvite) {
      throw new ConflictException('Đã có lời mời đang chờ cho email này');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true },
    });

    const invite = await this.prisma.staffInvite.create({
      data: { storeId, email: dto.email, token, expiresAt, status: 'PENDING' },
    });

    await this.prisma.notification.create({
      data: {
        userId: invitedUser.id,
        type: NotificationType.STAFF_INVITED,
        title: 'Lời mời nhân viên',
        body: `Bạn được mời làm nhân viên tại cơ sở "${store.name}". Kiểm tra email để nhận link kích hoạt.`,
      },
    });

    return { invite, token };
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
      const createdStaff = await tx.staff.create({
        data: { userId, storeId: invite.storeId, status: StaffStatus.ACTIVE },
      });

      let storeStaffRole = await tx.role.findFirst({
        where: { code: STAFF_ROLE_CODE, storeId: invite.storeId },
      });

      if (!storeStaffRole) {
        const template = await tx.role.findFirst({
          where: { code: STAFF_ROLE_CODE, storeId: null },
          include: { permissions: true },
        });
        if (!template) {
          throw new BadRequestException('SHOP_STAFF template role không tồn tại. Chạy seed trước.');
        }
        storeStaffRole = await tx.role.create({
          data: {
            name: template.name,
            code: template.code,
            description: template.description,
            isSystem: false,
            storeId: invite.storeId,
          },
        });
        if (template.permissions.length) {
          await tx.rolePermission.createMany({
            data: template.permissions.map((p) => ({
              roleId: storeStaffRole!.id,
              permissionId: p.permissionId,
            })),
            skipDuplicates: true,
          });
        }
      }

      await tx.userRole.create({
        data: { userId, roleId: storeStaffRole.id, storeId: invite.storeId },
      });

      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', staffId: createdStaff.id },
      });

      return tx.staff.findUniqueOrThrow({
        where: { id: createdStaff.id },
        include: staffInclude,
      });
    });

    await this.permissionCache.invalidateUser(userId);
    return this.mapStaff(staff);
  }

  async findAll(storeId: string) {
    const list = await this.prisma.staff.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
      include: staffInclude,
    });
    return list.map((s) => this.mapStaff(s));
  }

  async findOne(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId },
      include: staffInclude,
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
    await this.storesService.checkOwnership(storeId, ownerId);
    const staff = await this.findOne(storeId, staffId);

    await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: staffId },
        data: { status: StaffStatus.INACTIVE },
      });
      await tx.userRole.deleteMany({
        where: { userId: staff.userId, storeId },
      });
    });

    await this.permissionCache.invalidateUser(staff.userId);
    return { removed: true };
  }

  private mapStaff<T extends { telegramChatId: string | null; telegramLinkToken?: string | null }>(
    staff: T,
  ): Omit<T, 'telegramChatId' | 'telegramLinkToken'> & { telegramLinked: boolean } {
    const { telegramChatId, telegramLinkToken: _token, ...rest } = staff as any;
    return { ...rest, telegramLinked: telegramChatId !== null };
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
    const staff = await this.prisma.staff.findFirst({
      where: { userId, storeId, status: StaffStatus.ACTIVE },
      include: staffInclude,
    });
    if (!staff) throw new NotFoundException('Bạn không phải nhân viên của cơ sở này');
    return this.mapStaff(staff);
  }

  async getMyTelegramStatus(storeId: string, userId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { userId, storeId, status: StaffStatus.ACTIVE },
      select: { telegramChatId: true },
    });
    if (!staff) throw new NotFoundException('Bạn không phải nhân viên của cơ sở này');
    return { telegramLinked: staff.telegramChatId !== null };
  }

  async generateTelegramToken(storeId: string, userId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { userId, storeId, status: StaffStatus.ACTIVE },
    });
    if (!staff) throw new NotFoundException('Bạn không phải nhân viên của cơ sở này');

    const token = randomBytes(16).toString('hex');
    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { telegramLinkToken: token },
    });

    const botName = process.env.TELEGRAM_BOT_USERNAME ?? 'GloworaBot';
    return { linkUrl: `https://t.me/${botName}?start=${token}`, token };
  }
}
