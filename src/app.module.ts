import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './features/identity/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { IdentityModule } from './features/identity.module';
import { CatalogModule } from './features/catalog.module';
import { BookingModule } from './features/booking.module';
import { MessagingModule } from './features/messaging.module';
import { StaffModule } from './features/staff.module';
import { NotificationsModule } from './features/notifications/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IdentityModule,
    CatalogModule,
    BookingModule,
    MessagingModule,
    StaffModule,
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
