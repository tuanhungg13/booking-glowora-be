import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramConsumer } from './telegram.consumer';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { GatewaysModule } from '../gateways/gateways.module';
import { MessagingModule } from '../features/messaging.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    forwardRef(() => MessagingModule),
    forwardRef(() => GatewaysModule),
  ],
  controllers: [TelegramController, TelegramConsumer],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
