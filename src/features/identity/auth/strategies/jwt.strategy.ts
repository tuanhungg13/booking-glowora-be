import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

export type JwtPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      // Non-null assertion an toàn: main.ts assertRequiredEnv() đã throw ở bootstrap
      // nếu thiếu JWT_ACCESS_SECRET, nên tới đây biến này chắc chắn đã có giá trị.
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({ message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa', errorCode: 'USER_INACTIVE' });
    }
    return {
      id: user.id,
      email: user.email,
      status: user.status,
    };
  }
}
