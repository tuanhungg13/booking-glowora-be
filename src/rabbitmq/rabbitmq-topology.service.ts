import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { RABBITMQ_QUEUES, RABBITMQ_RETRY_BACKOFF_MS, toDlq, toRetry } from './rabbitmq.constants';
import { buildRabbitmqUrl } from './rabbitmq.options';

// Các queue DLQ/retry chỉ là đích route-tới (x-dead-letter-routing-key), không có
// ClientsModule nào tự assert chúng — nếu thiếu, RabbitMQ âm thầm drop message dead-letter
// thay vì lưu lại/định tuyến lại. Service này đảm bảo DLQ + retry queue tồn tại trước khi
// app nhận traffic, đồng thời expose publishRetry() cho các consumer dùng chung 1 connection.
@Injectable()
export class RabbitmqTopologyService implements OnModuleInit {
  private readonly logger = new Logger(RabbitmqTopologyService.name);
  private channelWrapper!: ChannelWrapper;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const connection = amqp.connect([buildRabbitmqUrl(this.config)]);
    this.channelWrapper = connection.createChannel({
      setup: (channel: ConfirmChannel) =>
        Promise.all([
          ...Object.values(RABBITMQ_QUEUES).map((queue) =>
            channel.assertQueue(toDlq(queue), { durable: true }),
          ),
          // Retry queue: không có TTL cố định ở cấp queue — TTL được set theo từng
          // message lúc publishRetry() (backoff tăng dần theo số lần thử). Hết TTL,
          // RabbitMQ tự dead-letter message này ngược lại queue chính (routing key = queue).
          ...Object.values(RABBITMQ_QUEUES).map((queue) =>
            channel.assertQueue(toRetry(queue), {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': queue,
              },
            }),
          ),
        ]),
    });
    await this.channelWrapper.waitForConnect();
    this.logger.log('RabbitMQ DLQ + retry topology asserted');
  }

  // Đẩy lại 1 message lỗi vào `<queue>.retry` thay vì DLQ ngay — message chờ ở đó
  // theo `expiration` (ms) tương ứng với lần thử thứ `attempt`, rồi tự quay lại queue
  // chính. `x-retry-count` trong header được giữ nguyên qua dead-letter nên consumer
  // đọc lại đúng số lần đã thử ở lần nhận tiếp theo.
  async publishRetry(queue: string, content: Buffer, attempt: number): Promise<void> {
    const ttlMs = RABBITMQ_RETRY_BACKOFF_MS[attempt - 1] ?? RABBITMQ_RETRY_BACKOFF_MS[RABBITMQ_RETRY_BACKOFF_MS.length - 1];
    await this.channelWrapper.publish('', toRetry(queue), content, {
      persistent: true,
      expiration: String(ttlMs),
      headers: { 'x-retry-count': attempt },
    });
  }
}
