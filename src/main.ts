import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { RequestContextService } from './common/request-context.service';
import { SystemAuditInterceptor } from './common/interceptors/system-audit.interceptor';
import { SystemLogService } from './system-log/system-log.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use(app.get(RequestContextService).middleware());

  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    app.get(SystemAuditInterceptor),
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );
  const systemLogService = app.get(SystemLogService);
  app.useGlobalFilters(
    new PrismaExceptionFilter(systemLogService),
    new HttpExceptionFilter(systemLogService),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Booking Platform API')
      .setDescription('The booking platform API description')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const port = process.env.APP_PORT ?? 8080;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  logger.log(`NODE_ENV        : ${process.env.NODE_ENV ?? '(not set)'}`);
  logger.log(`Cookie sameSite : ${isProduction ? 'none' : 'lax'}`);
  logger.log(`Cookie secure   : ${isProduction}`);
  logger.log(`CORS origins    : ${allowedOrigins.join(', ')}`);
  logger.log(`Listening on    : ${port}`);
}
bootstrap();
