import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

type RequestWithContext = Request & {
  requestId?: string;
  user?: { id?: string };
};

type RequestContextStore = {
  request: RequestWithContext;
  response: Response;
  requestId: string;
};

const SKIP_PATHS = ['/auth/refresh', '/auth/me', '/auth/getMatrix', '/', '/notifications', '/slots/available'];

@Injectable()
export class RequestContextService {
  private readonly logger = new Logger('HTTP');
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  middleware() {
    return (request: RequestWithContext, response: Response, next: NextFunction) => {
      const requestId = randomUUID();
      request.requestId = requestId;

      // TODO: tạm tắt log để đo hiệu năng load-test, bật lại sau khi test xong
      // const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
      // if (!SKIP_PATHS.includes(path)) {
      //   this.logger.log(`→ [${requestId}] ${request.method} ${request.originalUrl ?? request.url} ip=${request.ip}`);
      //   response.on('finish', () => {
      //     this.logger.log(`← [${requestId}] ${request.method} ${request.originalUrl ?? request.url} | ${response.statusCode}`);
      //   });
      // }

      this.storage.run({ request, response, requestId }, next);
    };
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  getIpAddress(): string | undefined {
    const request = this.storage.getStore()?.request;
    if (!request) return undefined;

    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0]?.trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0]?.split(',')[0]?.trim();
    }

    return request.ip;
  }

  getActorId(): string | undefined {
    return this.storage.getStore()?.request.user?.id;
  }

  getRequest() {
    return this.storage.getStore()?.request;
  }
}
