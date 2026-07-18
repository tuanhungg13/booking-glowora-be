import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { Cron } from 'croner';
import { RABBITMQ_CLIENT } from '../../../rabbitmq/rabbitmq.constants';

@Injectable()
export class BookingReminderService implements OnModuleInit {
  private readonly logger = new Logger(BookingReminderService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(RABBITMQ_CLIENT.BOOKING_REMINDER_TICK)
    private readonly client: ClientProxy,
  ) {}

  onModuleInit() {
    // Cluster mode fork nhiều worker (xem main.ts), mỗi worker chạy 1 NestJS app riêng.
    // Nếu không chặn, cron này chạy lặp lại ở TỪNG worker -> nhiều tick trùng lặp cùng lúc.
    // Chỉ worker được đánh dấu singleton mới trigger tick (việc *xử lý* tick thì được publish
    // qua RabbitMQ và tiêu thụ bởi BookingReminderConsumer ở bất kỳ worker nào — competing
    // consumer, không cần singleton cho phần đó).
    if (process.env.IS_SINGLETON_WORKER === '0') {
      this.logger.log('Bỏ qua booking reminder cron ở worker này (đã chạy ở worker singleton)');
      return;
    }
    const expr = this.config.get<string>('REMINDER_CRON_EXPR', '*/10 * * * *');
    new Cron(expr, () => { this.publishTick(); });
    this.logger.log(`Booking reminder job started (cron: ${expr})`);
  }

  private publishTick(): void {
    this.client.emit('booking.reminder-tick', {}).subscribe({
      error: (err: Error) => this.logger.error(`Publish "booking.reminder-tick" failed: ${err.message}`, err.stack),
    });
  }
}
