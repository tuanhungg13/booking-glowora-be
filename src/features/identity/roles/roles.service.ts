import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionCacheService } from '../../../redis/permission-cache.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findFirst({
      where: { code: dto.code, storeId: dto.storeId ?? null },
    });
    if (existing) {
      throw new ConflictException('Role code already exists for this store');
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

  async findAll() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const current = await this.findOne(id);
    if (dto.code) {
      const storeId = dto.storeId !== undefined ? dto.storeId : current.storeId;
      const existing = await this.prisma.role.findFirst({
        where: { code: dto.code, storeId: storeId ?? null, NOT: { id } },
      });
      if (existing) throw new ConflictException('Role code already exists for this store');
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
    const result = this.prisma.role.update({
      where: { id },
      data,
      include: { permissions: { include: { permission: true } } },
    });

    if (dto.permissionIds !== undefined) {
      await this.permissionCache.invalidateAll();
    }

    return result;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.role.delete({ where: { id } });
    await this.permissionCache.invalidateAll();
    return { deleted: true };
  }
}
