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
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') || 'change-me-in-production',
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: { include: { role: { select: { name: true, code: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({ message: 'User not found or inactive', errorCode: 'USER_INACTIVE' });
    }
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.userRoles.map((ur) => ur.role.name),
    };
  }
}
