import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications/notifications.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { StoreAppointmentsController } from './store-appointments.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [AppointmentsController, StoreAppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
