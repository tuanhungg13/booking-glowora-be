import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebPushService } from './web-push.service';
import { SubscribeDto, UnsubscribeDto } from './dto/subscribe.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('push-subscriptions')
@ApiBearerAuth()
@Controller('push-subscriptions')
export class WebPushController {
  constructor(private readonly webPushService: WebPushService) {}

  @ApiOperation({ summary: 'Lấy VAPID public key để frontend đăng ký push' })
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.webPushService.getPublicKey() };
  }

  @ApiOperation({ summary: 'Đăng ký nhận push notification khi tắt tab' })
  @Post('subscribe')
  subscribe(@CurrentUser() user: CurrentUserPayload, @Body() dto: SubscribeDto) {
    return this.webPushService.saveSubscription(user.id, dto);
  }

  @ApiOperation({ summary: 'Huỷ đăng ký push notification' })
  @Post('unsubscribe')
  unsubscribe(@CurrentUser() user: CurrentUserPayload, @Body() dto: UnsubscribeDto) {
    return this.webPushService.deleteSubscription(dto.endpoint, user.id);
  }
}
