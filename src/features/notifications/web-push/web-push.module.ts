import { Module } from '@nestjs/common';
import { WebPushService } from './web-push.service';
import { WebPushController } from './web-push.controller';
import { WebPushConsumer } from './web-push.consumer';

@Module({
  controllers: [WebPushController, WebPushConsumer],
  providers: [WebPushService],
  exports: [WebPushService],
})
export class WebPushModule {}
