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
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        fullName: dto.fullName ?? '',
        phone: dto.phone,
        status: dto.status ?? UserStatus.ACTIVE,
        userRoles: dto.roleAssignments?.length
          ? {
              create: dto.roleAssignments.map((a) => ({
                shopId: a.shopId,
                roleId: a.roleId,
              })),
            }
          : undefined,
      },
      select: this.selectSafe(),
    });
    return user;
  }

  async findAll(params?: { status?: UserStatus; skip?: number; take?: number }) {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: params?.status ? { status: params.status } : undefined,
        skip: params?.skip,
        take: params?.take ?? 20,
        select: this.selectSafe(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: params?.status ? { status: params.status } : undefined,
      }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.selectSafe(),
        userRoles: {
          include: {
            role: { select: { id: true, name: true, code: true } },
            shop: { select: { id: true, name: true } },
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
      const shopRolesCount = dto.roleAssignments.filter((a) => a.shopId).length;
      if (shopRolesCount > 3) {
        throw new BadRequestException('Tài khoản không thể có quá 3 vai trò cơ sở');
      }
      data.userRoles = {
        deleteMany: {},
        ...(dto.roleAssignments.length
          ? {
              create: dto.roleAssignments.map((a) => ({
                shopId: a.shopId,
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
}
