import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

class RefreshDto {
  refreshToken: string;
}

class LogoutDto {
  refreshToken: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Đăng nhập' })
  @Public()
  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.login({
      id: user.id,
      email: user.email,
      roles: user.roles ?? [],
    });
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
  async refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @ApiOperation({ summary: 'Đăng xuất, blacklist refresh token' })
  @ApiBearerAuth()
  @Post('logout')
  async logout(@CurrentUser() user: CurrentUserPayload, @Body() body: LogoutDto) {
    return this.authService.logout(user.id, body.refreshToken);
  }

  @ApiOperation({ summary: 'Lấy thông tin user hiện tại kèm roles' })
  @ApiBearerAuth()
  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.id);
  }

  @ApiOperation({ summary: 'Ma trận permissions của user hiện tại' })
  @ApiBearerAuth()
  @Get('getMatrix')
  async getMatrix(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getPermissionMatrix(user.id);
  }
}
