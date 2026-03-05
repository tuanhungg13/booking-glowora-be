import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
        fullName: dto.fullName,
        phone: dto.phone,
        status: dto.status ?? UserStatus.ACTIVE,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
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
        roles: { include: { role: { select: { id: true, name: true } } } },
        staffServices: { include: { service: { select: { id: true, name: true } } } },
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
    const data: {
      email?: string;
      fullName?: string;
      phone?: string;
      status?: UserStatus;
      password?: string;
      roles?: { deleteMany: object; create?: { roleId: string }[] };
    } = {
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      status: dto.status,
    };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    if (dto.roleIds !== undefined) {
      data.roles = {
        deleteMany: {},
        ...(dto.roleIds.length ? { create: dto.roleIds.map((roleId) => ({ roleId })) } : {}),
      };
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: this.selectSafe(),
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
