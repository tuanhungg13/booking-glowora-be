import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications/notifications.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
