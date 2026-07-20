import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionCacheService } from '../../../redis/permission-cache.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const SUPER_ADMIN_CODE = 'SUPER_ADMIN';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async create(dto: CreateRoleDto, currentUserId: string) {
    if (!(await this.isSuperAdmin(currentUserId))) {
      // Role không gắn store nào (storeId null) là vai trò hệ thống — chỉ SUPER_ADMIN được tạo,
      // tránh 1 chủ cửa hàng tạo ra vai trò có phạm vi toàn hệ thống rồi tự gán quyền admin.
      if (!dto.storeId) {
        throw new ForbiddenException('Chỉ quản trị viên hệ thống được tạo vai trò không thuộc cửa hàng nào');
      }
      await this.assertOwnsStore(dto.storeId, currentUserId);
    }

    const existing = await this.prisma.role.findFirst({
      where: { code: dto.code, storeId: dto.storeId ?? null },
    });
    if (existing) {
      throw new ConflictException('Mã vai trò đã tồn tại trong cửa hàng này');
    }
    return this.prisma.role.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        storeId: dto.storeId,
        permissions: dto.permissionIds?.length
          ? { create: dto.permissionIds.map((id) => ({ permissionId: id })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findAll(currentUserId: string) {
    if (await this.isSuperAdmin(currentUserId)) {
      return this.prisma.role.findMany({
        orderBy: { name: 'asc' },
        include: { permissions: { include: { permission: true } } },
      });
    }

    // Không phải SUPER_ADMIN: chỉ thấy vai trò hệ thống (chỉ xem, không sửa được — xem update/remove)
    // và vai trò của những cửa hàng mình sở hữu hoặc đang là nhân viên.
    const storeIds = await this.getViewableStoreIds(currentUserId);
    return this.prisma.role.findMany({
      where: { OR: [{ storeId: null }, { storeId: { in: storeIds } }] },
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findOne(id: string, currentUserId: string) {
    const role = await this.findOneRaw(id);

    if (!(await this.isSuperAdmin(currentUserId)) && role.storeId !== null) {
      const storeIds = await this.getViewableStoreIds(currentUserId);
      if (!storeIds.includes(role.storeId)) {
        throw new ForbiddenException('Bạn không có quyền xem vai trò này');
      }
    }

    return role;
  }

  async update(id: string, dto: UpdateRoleDto, currentUserId: string) {
    const current = await this.findOneRaw(id);

    if (!(await this.isSuperAdmin(currentUserId))) {
      // Vai trò hệ thống (SUPER_ADMIN/SHOP_OWNER/SHOP_STAFF/CUSTOMER) dùng chung cho toàn bộ
      // user/cửa hàng — không cho sửa qua API thường, tránh 1 chủ cửa hàng tự cấp thêm quyền
      // cho chính vai trò mà MỌI chủ cửa hàng khác cũng đang dùng chung.
      if (current.isSystem || current.storeId === null) {
        throw new ForbiddenException('Không thể sửa vai trò hệ thống');
      }
      await this.assertOwnsStore(current.storeId, currentUserId);
      if (dto.storeId !== undefined && dto.storeId !== current.storeId) {
        throw new ForbiddenException('Không thể chuyển vai trò sang cửa hàng khác');
      }
    }

    if (dto.code) {
      const storeId = dto.storeId !== undefined ? dto.storeId : current.storeId;
      const existing = await this.prisma.role.findFirst({
        where: { code: dto.code, storeId: storeId ?? null, NOT: { id } },
      });
      if (existing) throw new ConflictException('Mã vai trò đã tồn tại trong cửa hàng này');
    }
    const data: Prisma.RoleUpdateInput = {
      name: dto.name,
      code: dto.code,
      description: dto.description,
      store:
        dto.storeId === undefined
          ? undefined
          : dto.storeId === null
            ? { disconnect: true }
            : { connect: { id: dto.storeId } },
    };
    if (dto.permissionIds !== undefined) {
      data.permissions = {
        deleteMany: {},
        ...(dto.permissionIds.length ? { create: dto.permissionIds.map((permissionId) => ({ permissionId })) } : {}),
      };
    }
    const result = await this.prisma.role.update({
      where: { id },
      data,
      include: { permissions: { include: { permission: true } } },
    });

    if (dto.permissionIds !== undefined) {
      await this.permissionCache.invalidateAll();
    }

    return result;
  }

  async remove(id: string, currentUserId: string) {
    const current = await this.findOneRaw(id);

    if (!(await this.isSuperAdmin(currentUserId))) {
      if (current.isSystem || current.storeId === null) {
        throw new ForbiddenException('Không thể xóa vai trò hệ thống');
      }
      await this.assertOwnsStore(current.storeId, currentUserId);
    }

    await this.prisma.role.delete({ where: { id } });
    await this.permissionCache.invalidateAll();
    return { deleted: true };
  }

  // ─── Access control helpers ────────────────────────────────────────────────

  private async findOneRaw(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    return role;
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const role = await this.prisma.userRole.findFirst({
      where: { userId, storeId: null, role: { code: SUPER_ADMIN_CODE } },
      select: { id: true },
    });
    return !!role;
  }

  private async assertOwnsStore(storeId: string, userId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
    if (!store || store.ownerId !== userId) {
      throw new ForbiddenException('Bạn không phải chủ cửa hàng này');
    }
  }

  private async getViewableStoreIds(userId: string): Promise<string[]> {
    const [ownedStores, staffRows] = await Promise.all([
      this.prisma.store.findMany({ where: { ownerId: userId }, select: { id: true } }),
      this.prisma.staff.findMany({ where: { userId, status: 'ACTIVE' }, select: { storeId: true } }),
    ]);
    return [...new Set([...ownedStores.map((s) => s.id), ...staffRows.map((s) => s.storeId)])];
  }
}
