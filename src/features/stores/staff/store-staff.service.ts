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
import { DayOffStatus, NotificationType, StaffStatus } from '@prisma/client';
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

    const pendingInvite = await this.prisma.staffInvite.findFirst({
      where: { email: dto.email, storeId, status: 'PENDING' },
    });
    if (pendingInvite) {
      throw new ConflictException('Đã có lời mời đang chờ cho email này');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.staffInvite.create({
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
      const createdStaff = await tx.staff.create({
        data: {
          userId,
          storeId: invite.storeId,
          status: StaffStatus.ACTIVE,
          phone: user.phone ?? null,
          address: user.address ?? null,
          provinceId: user.provinceId ?? null,
          wardId: user.wardId ?? null,
        },
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
}
