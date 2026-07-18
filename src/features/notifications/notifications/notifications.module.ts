import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { GatewaysModule } from '../../../gateways/gateways.module';
import { MailModule } from '../../../mail/mail.module';

@Module({
  imports: [forwardRef(() => GatewaysModule), MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
