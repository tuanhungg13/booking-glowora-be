import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

const CACHE_PREFIX = 'user:permissions:';

@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);

  constructor(private readonly redis: RedisService) {}

  async invalidateUser(userId: string): Promise<void> {
    try {
      await this.redis.del(`${CACHE_PREFIX}${userId}`);
      this.logger.debug(`Invalidated permission cache for user ${userId}`);
    } catch (err) {
      this.logger.warn('Failed to invalidate user permission cache', (err as Error).message);
    }
  }

  async invalidateAll(): Promise<void> {
    try {
      const deleted = await this.redis.delByPattern(`${CACHE_PREFIX}*`);
      this.logger.debug(`Invalidated ${deleted} permission cache entries`);
    } catch (err) {
      this.logger.warn('Failed to invalidate all permission caches', (err as Error).message);
    }
  }
}
