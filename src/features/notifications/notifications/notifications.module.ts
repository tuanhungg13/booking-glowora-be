import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { GatewaysModule } from '../../../gateways/gateways.module';
import { MailModule } from '../../../mail/mail.module';
import { WebPushModule } from '../web-push/web-push.module';

@Module({
  imports: [forwardRef(() => GatewaysModule), MailModule, WebPushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
