import { Body, Controller, Get, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

const ACCESS_TOKEN_TTL = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Đăng nhập' })
  @Public()
  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login({
      id: user.id,
      email: user.email,
      roles: user.roles ?? [],
    });

    res.cookie('access_token', result.access_token, { ...COOKIE_BASE, maxAge: ACCESS_TOKEN_TTL });
    res.cookie('refresh_token', result.refresh_token, { ...COOKIE_BASE, maxAge: REFRESH_TOKEN_TTL });

    return result;
  }

  @ApiOperation({ summary: 'Đăng ký tài khoản (tự động gán role CUSTOMER)' })
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Làm mới access token bằng refresh token' })
  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token as string;
    const result = await this.authService.refresh(refreshToken);

    res.cookie('access_token', result.access_token, { ...COOKIE_BASE, maxAge: ACCESS_TOKEN_TTL });
    res.cookie('refresh_token', result.refresh_token, { ...COOKIE_BASE, maxAge: REFRESH_TOKEN_TTL });

    return result;
  }

  @ApiOperation({ summary: 'Đăng xuất, blacklist refresh token' })
  @ApiBearerAuth()
  @Post('logout')
  async logout(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token as string;
    await this.authService.logout(user.id, refreshToken ?? '');

    res.clearCookie('access_token', COOKIE_BASE);
    res.clearCookie('refresh_token', COOKIE_BASE);

    return { success: true };
  }

  @ApiOperation({ summary: 'Lấy thông tin user hiện tại kèm roles' })
  @ApiBearerAuth()
  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.id);
  }

  @ApiOperation({ summary: 'Permissions của user trong context shop (bỏ qua x-shop-id nếu là SUPER_ADMIN)' })
  @ApiBearerAuth()
  @Get('getMatrix')
  async getMatrix(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-shop-id') shopId?: string,
  ) {
    return this.authService.getPermissionMatrix(user.id, shopId);
  }
}
