import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { RABBITMQ_CLIENT, RABBITMQ_QUEUES } from './rabbitmq.constants';
import { buildRmqProducerOptions } from './rabbitmq.options';
import { RabbitmqTopologyService } from './rabbitmq-topology.service';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_CLIENT.NOTIFICATIONS_EMAIL,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          buildRmqProducerOptions(RABBITMQ_QUEUES.NOTIFICATIONS_EMAIL, config),
      },
      {
        name: RABBITMQ_CLIENT.NOTIFICATIONS_PUSH,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          buildRmqProducerOptions(RABBITMQ_QUEUES.NOTIFICATIONS_PUSH, config),
      },
      {
        name: RABBITMQ_CLIENT.TELEGRAM_FORWARD,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          buildRmqProducerOptions(RABBITMQ_QUEUES.TELEGRAM_FORWARD, config),
      },
      {
        name: RABBITMQ_CLIENT.BOOKING_REMINDER_TICK,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) =>
          buildRmqProducerOptions(RABBITMQ_QUEUES.BOOKING_REMINDER_TICK, config),
      },
    ]),
  ],
  providers: [RabbitmqTopologyService],
  exports: [ClientsModule, RabbitmqTopologyService],
})
export class RabbitmqModule {}
