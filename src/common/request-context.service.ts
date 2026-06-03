import { Injectable } from '@nestjs/common';
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

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  middleware() {
    return (request: RequestWithContext, response: Response, next: NextFunction) => {
      const requestId = randomUUID();
      request.requestId = requestId;

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
