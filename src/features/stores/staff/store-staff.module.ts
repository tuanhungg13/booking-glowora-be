import { Module } from '@nestjs/common';
import { RedisModule } from '../../../redis/redis.module';
import { StoresModule } from '../stores.module';
import { StaffInvitesController, StoreStaffController } from './store-staff.controller';
import { StoreStaffService } from './store-staff.service';

@Module({
  imports: [StoresModule, RedisModule],
  controllers: [StoreStaffController, StaffInvitesController],
  providers: [StoreStaffService],
})
export class StoreStaffModule {}
