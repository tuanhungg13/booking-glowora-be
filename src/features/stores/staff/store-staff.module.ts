import { Module } from '@nestjs/common';
import { RedisModule } from '../../../redis/redis.module';
import { StoresModule } from '../stores.module';
import { MailModule } from '../../../mail/mail.module';
import { GatewaysModule } from '../../../gateways/gateways.module';
import { StaffInvitesController, StoreStaffController } from './store-staff.controller';
import { StoreStaffService } from './store-staff.service';

@Module({
  imports: [StoresModule, RedisModule, MailModule, GatewaysModule],
  controllers: [StoreStaffController, StaffInvitesController],
  providers: [StoreStaffService],
})
export class StoreStaffModule {}
