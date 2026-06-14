import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false, info: Error): TUser {
    if (err) throw err;
    if (!user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({ message: 'Phiên đăng nhập đã hết hạn', errorCode: 'TOKEN_EXPIRED' });
      }
      throw new UnauthorizedException({ message: 'Token không hợp lệ hoặc bị thiếu', errorCode: 'TOKEN_INVALID' });
    }
    return user;
  }
}
