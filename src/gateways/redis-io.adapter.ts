import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import type { Redis } from 'ioredis';

// Cluster mode (xem main.ts) fork nhiều worker, mỗi worker có 1 Socket.IO Server riêng
// trong memory. Không có adapter này, server.to(room).emit() ở ChatGateway chỉ phát tới
// client đang connect vào ĐÚNG worker gọi hàm đó — client connect ở worker khác sẽ không
// nhận được (mất tin lặng lẽ, không lỗi). Adapter này dùng Redis pub/sub để mọi worker biết
// về nhau, join/leave room và emit được đồng bộ qua cả cụm.
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly pubClient: Redis,
    private readonly subClient: Redis,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }
}
