import { ConfigService } from '@nestjs/config';
import { RmqOptions, Transport } from '@nestjs/microservices';
import { toDlq } from './rabbitmq.constants';

export function buildRabbitmqUrl(config: ConfigService): string {
  const host = config.get<string>('RABBITMQ_HOST', 'localhost');
  const port = config.get<number>('RABBITMQ_PORT', 5672);
  const user = config.get<string>('RABBITMQ_USER', 'guest');
  const pass = config.get<string>('RABBITMQ_PASSWORD', 'guest');
  return `amqp://${user}:${pass}@${host}:${port}`;
}

// queueOptions dùng chung cho cả producer (ClientsModule) và consumer (main.ts) để queue
// declaration luôn khớp nhau — nếu 2 bên assert cùng 1 queue với arguments khác nhau,
// RabbitMQ trả lỗi PRECONDITION_FAILED và đóng connection.
function buildQueueOptions(queue: string, config: ConfigService) {
  return {
    urls: [buildRabbitmqUrl(config)],
    queue,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': toDlq(queue),
      },
    },
    persistent: true,
  };
}

// Dùng cho consumer (main.ts connectMicroservice). noAck:false bắt buộc để consumer tự
// ack/nack thủ công sau khi xử lý xong (xem helper ack() trong mỗi *.consumer.ts) — mặc
// định Nest RMQ transport là noAck:true (auto-ack ngay khi nhận), giữ default sẽ làm mất
// message khi xử lý lỗi và khiến DLQ vô nghĩa.
export function buildRmqConsumerOptions(queue: string, config: ConfigService): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      ...buildQueueOptions(queue, config),
      prefetchCount: 5,
      noAck: false,
    },
  };
}

// Dùng cho producer (ClientsModule.registerAsync — ClientProxy publish qua .emit()).
// KHÔNG được set noAck:false ở đây: Nest luôn tự tạo 1 reply-queue consumer nội bộ khi
// ClientProxy connect (dùng cho cơ chế request/response .send(), dù ta chỉ publish bằng
// .emit()) — consumer nội bộ đó không tự ack, nên noAck:false làm RabbitMQ đóng channel
// với lỗi "PRECONDITION_FAILED - reply consumer cannot acknowledge".
export function buildRmqProducerOptions(queue: string, config: ConfigService): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: buildQueueOptions(queue, config),
  };
}
