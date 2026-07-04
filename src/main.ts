import cluster from 'node:cluster';
import * as os from 'node:os';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
// import { LoggingInterceptor } from './common/interceptors/logging.interceptor'; // tạm tắt để đo hiệu năng load-test
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { RequestContextService } from './common/request-context.service';
import { SystemAuditInterceptor } from './common/interceptors/system-audit.interceptor';
import { SystemLogService } from './system-log/system-log.service';
import { RedisService } from './redis/redis.service';
import { RedisIoAdapter } from './gateways/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use(app.get(RequestContextService).middleware());

  // Đồng bộ Socket.IO qua Redis pub/sub giữa các worker cluster (xem redis-io.adapter.ts)
  const redisService = app.get(RedisService);
  const pubClient = redisService.getClient().duplicate();
  const subClient = pubClient.duplicate();
  app.useWebSocketAdapter(new RedisIoAdapter(app, pubClient, subClient));

  const allowedOrigins = (process.env.FRONTEND_CORS_ORIGINS ?? 'http://localhost:3000')
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
    // TODO: tạm tắt để đo hiệu năng load-test, bật lại sau khi test xong
    // new LoggingInterceptor(),
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

// Node chỉ chạy JS trên 1 thread — phần CPU-bound của mỗi request (JWT verify,
// class-validator/class-transformer, RxJS interceptor pipeline, serialize response)
// xếp hàng tuần tự trên thread đó. Dưới tải nhiều request đồng thời, thời gian xếp hàng
// này chiếm phần lớn độ trễ dù DB gần như rảnh (đã đo: MySQL Threads_running~2 trong khi
// 100 request/lúc mất 1-2s). Fork N worker (mỗi worker 1 core) để dùng hết CPU thay vì
// nghẽn ở 1 thread. WEB_CONCURRENCY cho phép override số worker (vd giới hạn trong container
// nhỏ); mặc định theo số core máy. Set WEB_CONCURRENCY=1 để tắt cluster (vd khi debug).
const numWorkers = Number(process.env.WEB_CONCURRENCY) || os.cpus().length;

if (numWorkers > 1 && cluster.isPrimary) {
  // Trên Windows, cluster module mặc định dùng SCHED_NONE (để OS tự chia connection
  // qua shared handle) thay vì SCHED_RR như Linux/Mac — nhưng đo thực tế cho thấy OS
  // không chia đều: gần như toàn bộ 100 request đồng thời dồn vào đúng 1 worker (CPU
  // time của 1 worker tăng ~1s trong khi 7 worker còn lại gần như không đổi), khiến
  // cluster fork ở trên vô hiệu. Ép SCHED_RR để primary tự round-robin connection
  // qua các worker thay vì để Windows quyết định.
  cluster.schedulingPolicy = cluster.SCHED_RR;

  const logger = new Logger('Cluster');
  logger.log(`Primary ${process.pid} đang fork ${numWorkers} worker`);

  // Mỗi worker chạy 1 NestJS app riêng -> onModuleInit() (cron nhắc lịch, đăng ký webhook
  // Telegram...) sẽ chạy lặp lại ở TỪNG worker nếu không chặn. Chỉ đánh dấu đúng 1 worker
  // (IS_SINGLETON_WORKER=1) để các service tự kiểm tra cờ này trước khi chạy phần việc
  // "chỉ chạy 1 lần cho cả cụm" (xem booking-reminder.service.ts, telegram.service.ts).
  let singletonWorkerId: number | undefined;
  const forkWorker = (isSingleton: boolean) => {
    const worker = cluster.fork({ IS_SINGLETON_WORKER: isSingleton ? '1' : '0' });
    if (isSingleton) singletonWorkerId = worker.id;
    return worker;
  };

  forkWorker(true);
  for (let i = 1; i < numWorkers; i++) forkWorker(false);

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} thoát (code=${code}, signal=${signal}) — fork lại`);
    forkWorker(worker.id === singletonWorkerId);
  });
} else {
  bootstrap();
}
