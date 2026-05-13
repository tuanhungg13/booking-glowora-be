import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { JwtAuthGuard } from './features/identity/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './features/identity/auth/guards/permissions.guard';
import { IdentityModule } from './features/identity.module';
import { CatalogModule } from './features/catalog.module';
import { BookingModule } from './features/booking.module';
import { MessagingModule } from './features/messaging.module';
import { StaffModule } from './features/staff.module';
import { NotificationsModule } from './features/notifications/notifications/notifications.module';
import { StoresModule } from './features/stores/stores.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    IdentityModule,
    CatalogModule,
    BookingModule,
    MessagingModule,
    StaffModule,
    StoresModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
