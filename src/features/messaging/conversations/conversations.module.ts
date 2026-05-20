import { Module, forwardRef } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RedisModule } from '../../../redis/redis.module';
import { AiModule } from '../../../ai/ai.module';
import { TelegramModule } from '../../../telegram/telegram.module';

@Module({
  imports: [PrismaModule, RedisModule, AiModule, forwardRef(() => TelegramModule)],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
