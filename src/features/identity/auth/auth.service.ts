import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RedisService } from '../../../redis/redis.service';
import { MailService } from '../../../mail/mail.service';
import { WebPushService } from '../../notifications/web-push/web-push.service';
import { ALL_PERMISSION_CODES } from '../../../common/constants/permissions';
import { SystemLogService } from '../../../system-log/system-log.service';
import { LogType } from '@prisma/client';

const CUSTOMER_ROLE_CODE = 'CUSTOMER';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly webPush: WebPushService,
    private readonly systemLog: SystemLogService,
  ) { }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: { include: { role: { select: { name: true, code: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE || !user.password) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    const { password: _, ...rest } = user;
    return { ...rest, roles: user.userRoles.map((ur) => ur.role.name) };
  }

  async login(user: { id: string; email: string; roles: string[] }, ipAddress?: string, requestId?: string) {
    const accessToken = this._signAccess(user.id, user.email);
    const refreshToken = this._signRefresh(user.id, user.email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 10) },
    });

    this.systemLog.log({ type: LogType.AUTH_LOGIN, actorId: user.id, targetId: user.id, targetType: 'User', metadata: { email: user.email }, ipAddress, requestId });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, roles: user.roles },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email đã được đăng ký');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const pendingKey = `otp:register:${dto.email}`;
    await this.redis.set(
      pendingKey,
      JSON.stringify({
        otp,
        hashedPassword,
        fullName: dto.fullName ?? '',
        phone: dto.phone ?? null,
      }),
      600,
    );

    await this.mail.sendOtpVerification(dto.email, otp, dto.fullName);

    return { message: 'OTP đã được gửi đến email của bạn. Vui lòng xác nhận trong 10 phút.' };
  }

  async verifyRegisterOtp(dto: VerifyOtpDto, ipAddress?: string, requestId?: string) {
    const pendingKey = `otp:register:${dto.email}`;
    const raw = await this.redis.get(pendingKey);

    if (!raw) throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');

    const pending = JSON.parse(raw) as {
      otp: string;
      hashedPassword: string;
      fullName: string;
      phone: string | null;
    };

    if (pending.otp !== dto.otp) throw new BadRequestException('OTP không chính xác');

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email đã được đăng ký');

    const customerRole = await this.prisma.role.findFirst({
      where: { code: CUSTOMER_ROLE_CODE, storeId: null },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: pending.hashedPassword,
        fullName: pending.fullName,
        phone: pending.phone ?? undefined,
        ...(customerRole
          ? { userRoles: { create: { roleId: customerRole.id, storeId: null } } }
          : {}),
      },
      select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
    });

    await this.redis.del(pendingKey);

    this.systemLog.log({ type: LogType.AUTH_REGISTER, actorId: user.id, targetId: user.id, targetType: 'User', metadata: { email: dto.email }, ipAddress, requestId });

    return user;
  }

  async refresh(refreshToken: string) {
    const blacklistKey = `blacklist:refresh:${refreshToken}`;
    const isBlacklisted = await this.redis.exists(blacklistKey);
    if (isBlacklisted) throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi');

    let payload: { sub: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
    }
    if (!user.refreshToken || !(await bcrypt.compare(refreshToken, user.refreshToken))) {
      throw new UnauthorizedException('Phiên đăng nhập không khớp');
    }

    const newAccess = this._signAccess(user.id, user.email);
    const newRefresh = this._signRefresh(user.id, user.email);

    // Blacklist cũ, lưu hash mới
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 604800;
    if (ttl > 0) await this.redis.set(blacklistKey, '1', ttl);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(newRefresh, 10) },
    });

    return { access_token: newAccess, refresh_token: newRefresh };
  }

  async logout(userId: string, refreshToken: string) {
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 604800;
    if (ttl > 0) {
      await this.redis.set(`blacklist:refresh:${refreshToken}`, '1', ttl);
    }
    await Promise.all([
      this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } }),
      this.webPush.deleteAllSubscriptionsForUser(userId),
    ]);
    this.systemLog.log({ type: LogType.AUTH_LOGOUT, actorId: userId, targetId: userId, targetType: 'User' });
    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        address: true,
        provinceId: true,
        wardId: true,
        province: { select: { id: true, name: true, code: true, type: true } },
        ward: { select: { id: true, name: true, type: true, provinceId: true } },
        avatarUrl: true,
        status: true,
        createdAt: true,
        userRoles: {
          select: {
            storeId: true,
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return {
      ...user,
      roles: user.userRoles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
        storeId: ur.storeId,
      })),
      userRoles: undefined,
    };
  }

  async getPermissionMatrix(userId: string, storeId?: string) {
    // storeId=undefined → tìm system role (storeId IS NULL)
    // storeId có giá trị → tìm store-specific role
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, storeId: storeId ?? null },
      select: {
        roleId: true,
        storeId: true,
        role: {
          select: {
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });

    if (!userRole) {
      return { roleId: null, storeId: storeId ?? null, grantedPermissionCodes: [] };
    }

    const granted = new Set(userRole.role.permissions.map((rp) => rp.permission.code));

    const permissionMatrix = ALL_PERMISSION_CODES.reduce<Record<string, boolean>>((acc, code) => {
      acc[code] = granted.has(code);
      return acc;
    }, {});

    return {
      roleId: userRole.roleId,
      storeId: userRole.storeId,
      permissionMatrix,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, fullName: true, status: true },
    });

    if (!user) throw new NotFoundException('Email không tồn tại trong hệ thống');
    if (user.status !== UserStatus.ACTIVE) throw new BadRequestException('Tài khoản đã bị khóa');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`otp:reset:${dto.email}`, otp, 600);

    await this.mail.sendPasswordResetOtp(dto.email, otp, user.fullName ?? undefined);

    return { message: 'OTP đã được gửi đến email của bạn. Vui lòng xác nhận trong 10 phút.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const storedOtp = await this.redis.get(`otp:reset:${dto.email}`);

    if (!storedOtp) throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
    if (storedOtp !== dto.otp) throw new BadRequestException('OTP không chính xác');

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Tài khoản không tồn tại hoặc đã bị khóa');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, refreshToken: null },
    });

    await this.redis.del(`otp:reset:${dto.email}`);

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password ?? '');
    if (!isMatch) throw new BadRequestException('Mật khẩu hiện tại không chính xác');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(dto.newPassword, 10) },
    });

    return { message: 'Đổi mật khẩu thành công.' };
  }

  private _signAccess(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private _signRefresh(userId: string, email: string): string {
    const options: JwtSignOptions = {
      secret:
        this.config.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    } as JwtSignOptions;

    return this.jwtService.sign(
      { sub: userId, email },
      options,
    );
  }
}
