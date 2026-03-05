import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { PermissionCacheService } from './permission-cache.service';

@Global()
@Module({
  providers: [RedisService, PermissionCacheService],
  exports: [RedisService, PermissionCacheService],
})
export class RedisModule {}
