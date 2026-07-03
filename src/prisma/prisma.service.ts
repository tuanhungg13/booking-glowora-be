import * as os from 'node:os';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not defined');
    }

    // App giờ chạy cluster mode (xem main.ts) — mỗi worker có PrismaService/pool riêng,
    // nên tổng connection = connectionLimit × số worker. Chia đều 1 ngân sách tổng
    // (DB_CONNECTION_BUDGET) cho số worker thay vì hardcode 1 số cố định mỗi worker,
    // để tổng không vượt quá max_connections của MySQL (200, xem docker-compose.yml)
    // dù chạy 1 hay N worker.
    const numWorkers = Number(process.env.WEB_CONCURRENCY) || os.cpus().length;
    const connectionBudget = Number(process.env.DB_CONNECTION_BUDGET) || 160;
    const connectionLimit = Math.max(10, Math.floor(connectionBudget / numWorkers));

    const adapter = new PrismaMariaDb({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB,
      allowPublicKeyRetrieval: true,
      connectionLimit,
      minimumIdle: Math.min(10, connectionLimit),
      connectTimeout: 10_000,
      acquireTimeout: 15_000,
      idleTimeout: 60_000,
    });

    super({
      adapter,
      // TODO: tạm tắt query/info/warn để đo hiệu năng load-test, bật lại sau khi test xong
      log: ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}