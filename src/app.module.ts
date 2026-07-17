import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { JwtAuthGuard } from './features/identity/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './features/identity/auth/guards/permissions.guard';
import { IdentityModule } from './features/identity.module';
import { CatalogModule } from './features/catalog.module';
import { BookingModule } from './features/booking.module';
import { MessagingModule } from './features/messaging.module';
import { StaffModule } from './features/staff.module';
import { NotificationsModule } from './features/notifications/notifications/notifications.module';
import { StoresModule } from './features/stores/stores.module';
import { LocationsModule } from './features/locations/locations.module';
import { StoreStaffModule } from './features/stores/staff/store-staff.module';
import { AiModule } from './ai/ai.module';
import { TelegramModule } from './telegram/telegram.module';
import { GatewaysModule } from './gateways/gateways.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { SystemLogModule } from './system-log/system-log.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Baseline chống flood cho toàn bộ API (mọi request không match @Throttle riêng đều
    // dùng limit này). Storage phải là Redis dùng chung (không phải in-memory mặc định)
    // vì app chạy Node cluster nhiều worker (xem main.ts) -> mỗi worker đếm riêng sẽ khiến
    // limit thực tế bị nhân lên theo số worker nếu không share state.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService, redisService: RedisService) => ({
        throttlers: [
          {
            ttl: seconds(config.get<number>('THROTTLE_TTL', 60)),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
        storage: new ThrottlerStorageRedisService(redisService.getClient()),
      }),
    }),
    SystemLogModule,
    CloudinaryModule,
    UploadModule,
    PrismaModule,
    RedisModule,
    IdentityModule,
    CatalogModule,
    BookingModule,
    MessagingModule,
    StaffModule,
    StoresModule,
    StoreStaffModule,
    LocationsModule,
    NotificationsModule,
    AiModule,
    TelegramModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Throttler chạy trước JwtAuthGuard để chặn flood sớm, trước khi tốn chi phí verify JWT.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
