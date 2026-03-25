import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Permission matrix for current user.
   * Note: This endpoint is not protected by @RequirePermissions (no permission codes needed),
   * but still requires JWT because the global JwtAuthGuard is enabled and route is not @Public().
   */
  @Get('getMatrix')
  async getMatrix(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getPermissionMatrix(user.id);
  }
}
