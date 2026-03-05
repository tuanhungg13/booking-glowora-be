import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: { include: { role: { select: { name: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    const { password: _, ...rest } = user;
    return { ...rest, roles: user.roles.map((r) => r.role.name) };
  }

  async login(user: { id: string; email: string; roles: string[] }) {
    return {
      access_token: this.jwtService.sign({
        sub: user.id,
        email: user.email,
      }),
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        fullName: dto.fullName,
        phone: dto.phone,
      },
      select: { id: true, email: true, fullName: true, phone: true },
    });
    return user;
  }
}
