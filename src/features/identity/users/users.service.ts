import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, UserStatus } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already exists');
    const hashed = await bcrypt.hash(dto.password, 10);
    const dedupedRoles = this.deduplicateRoles(dto.roleAssignments ?? []);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        fullName: dto.fullName ?? '',
        phone: dto.phone,
        status: dto.status ?? UserStatus.ACTIVE,
        userRoles: dedupedRoles.length
          ? {
            create: dedupedRoles.map((a) => ({
              storeId: a.storeId,
              roleId: a.roleId,
            })),
          }
          : undefined,
      },
      select: this.selectSafe(),
    });
    return user;
  }

  async findAll(params?: { status?: UserStatus; q?: string; skip?: number; take?: number }) {
    const where: Prisma.UserWhereInput = {}
    if (params?.status) where.status = params.status
    if (params?.q) {
      const q = params.q.trim()
      where.OR = [
        { fullName: { contains: q } },
        { email: { contains: q } },
      ]
    }
    const limit = params?.take ?? 20
    const skip = params?.skip ?? 0
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: this.selectSafe(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: Math.floor(skip / limit) + 1, limit };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.selectSafe(),
        userRoles: {
          include: {
            role: { select: { id: true, name: true, code: true } },
            store: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (existing) throw new ConflictException('Email already exists');
    }
    const data: Prisma.UserUpdateInput = {
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      status: dto.status,
    };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    if (dto.roleAssignments !== undefined) {
      const dedupedRoles = this.deduplicateRoles(dto.roleAssignments);
      const storeRolesCount = dedupedRoles.filter((a) => a.storeId).length;
      if (storeRolesCount > 3) {
        throw new BadRequestException('Tài khoản không thể có quá 3 vai trò cơ sở');
      }
      data.userRoles = {
        deleteMany: {},
        ...(dedupedRoles.length
          ? {
            create: dedupedRoles.map((a) => ({
              storeId: a.storeId,
              roleId: a.roleId,
            })),
          }
          : {}),
      };
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: this.selectSafe(),
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.findOne(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, phone: dto.phone, avatarUrl: dto.avatarUrl },
      select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, updatedAt: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  private selectSafe() {
    return {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  // MySQL treats NULL != NULL in UNIQUE constraints, so (userId, roleId, null) can be
  // inserted multiple times without violating @@unique([userId, roleId, storeId]).
  // Deduplicate here before any bulk insert to prevent phantom duplicates.
  private deduplicateRoles(assignments: Array<{ roleId: string; storeId?: string | null }>) {
    const seen = new Set<string>();
    return assignments.filter((a) => {
      const key = `${a.roleId}::${a.storeId ?? '__null__'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
