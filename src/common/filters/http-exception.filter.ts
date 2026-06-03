import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { LogType } from '@prisma/client';
import { SystemLogService } from '../../system-log/system-log.service';

type LoggableRequest = {
  requestId?: string;
  systemLogErrorRecorded?: boolean;
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  user?: { id?: string };
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly systemLog?: SystemLogService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<LoggableRequest>();
    const requestId = request?.requestId;

    const status = exception.getStatus
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception.getResponse() as
      | string
      | { message?: string | string[]; [key: string]: unknown };

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : Array.isArray(exceptionResponse.message)
        ? exceptionResponse.message.join(', ')
        : (exceptionResponse.message ?? exception.message);

    const errorCode =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>).errorCode
        : undefined;

    const body: Record<string, unknown> = { success: false, message, data: null };
    if (errorCode !== undefined) body.errorCode = errorCode;
    if (requestId !== undefined) body.requestId = requestId;

    if (request && !request.systemLogErrorRecorded) {
      this.systemLog?.logError(
        {
          type: LogType.SYSTEM_ERROR,
          actorId: request.user?.id,
          metadata: {
            method: request.method,
            path: request.originalUrl ?? request.url,
            params: request.params,
            query: request.query,
            statusCode: status,
            errorCode,
          },
        },
        exception,
      );
      request.systemLogErrorRecorded = true;
    }

    response.status(status).json(body);
  }
}
