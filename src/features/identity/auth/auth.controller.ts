import { Body, Controller, Get, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiHeader } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
  constructor(private readonly authService: AuthService) { }

  @ApiOperation({ summary: 'Đăng nhập' })
  @ApiBody({ type: LoginDto })
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

  @ApiOperation({ summary: 'Bước 1: Đăng ký — gửi OTP về email để xác nhận' })
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Bước 2: Xác nhận OTP — hoàn tất đăng ký tài khoản' })
  @Public()
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
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

  @ApiOperation({ summary: 'Bước 1: Quên mật khẩu — gửi OTP về email để xác nhận' })
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'Bước 2: Đặt lại mật khẩu — xác nhận OTP và cập nhật mật khẩu mới' })
  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
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

  @ApiOperation({ summary: 'Đổi mật khẩu (yêu cầu đăng nhập)' })
  @ApiBearerAuth()
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @ApiOperation({ summary: 'Lấy thông tin user hiện tại kèm roles' })
  @ApiBearerAuth()
  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.id);
  }

  @ApiOperation({ summary: 'Permissions của user trong context store (bỏ qua x-store-id nếu là SUPER_ADMIN)' })
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-store-id', required: false, description: 'Store ID (bỏ qua nếu là SUPER_ADMIN)' })
  @Get('getMatrix')
  async getMatrix(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.authService.getPermissionMatrix(user.id, storeId);
  }
}
