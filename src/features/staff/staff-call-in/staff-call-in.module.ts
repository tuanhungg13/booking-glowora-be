import { Module } from '@nestjs/common';
import { StaffCallInService } from './staff-call-in.service';
import { StaffCallInController } from './staff-call-in.controller';
import { GatewaysModule } from '../../../gateways/gateways.module';

@Module({
  imports: [GatewaysModule],
  controllers: [StaffCallInController],
  providers: [StaffCallInService],
  exports: [StaffCallInService],
})
export class StaffCallInModule {}
