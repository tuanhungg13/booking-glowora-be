import { Module } from '@nestjs/common';
import { StaffCallInService } from './staff-call-in.service';
import { StaffCallInController } from './staff-call-in.controller';
import { GatewaysModule } from '../../../gateways/gateways.module';
import { MailModule } from '../../../mail/mail.module';

@Module({
  imports: [GatewaysModule, MailModule],
  controllers: [StaffCallInController],
  providers: [StaffCallInService],
  exports: [StaffCallInService],
})
export class StaffCallInModule {}
