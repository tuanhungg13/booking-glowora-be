import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

type LoggableRequest = {
  requestId?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  user?: { id?: string };
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

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

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId ?? '-'}] ${request?.method ?? ''} ${request?.originalUrl ?? request?.url ?? ''} status=${status} ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json(body);
  }
}
