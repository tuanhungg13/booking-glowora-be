import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionCacheService } from '../../../redis/permission-cache.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Permission code already exists');
    return this.prisma.permission.create({
      data: {
        code: dto.code,
        name: dto.name ?? dto.code,
        description: dto.description,
      },
    });
  }

  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const perm = await this.prisma.permission.findUnique({ where: { id } });
    if (!perm) throw new NotFoundException('Permission not found');
    return perm;
  }

  async update(id: string, dto: UpdatePermissionDto) {
    await this.findOne(id);
    if (dto.code) {
      const existing = await this.prisma.permission.findFirst({
        where: { code: dto.code, NOT: { id } },
      });
      if (existing) throw new ConflictException('Permission code already exists');
    }
    const result = await this.prisma.permission.update({
      where: { id },
      data: { code: dto.code, description: dto.description },
    });

    if (dto.code) {
      await this.permissionCache.invalidateAll();
    }

    return result;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.permission.delete({ where: { id } });
    await this.permissionCache.invalidateAll();
    return { deleted: true };
  }
}
