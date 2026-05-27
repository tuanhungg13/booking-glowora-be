import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

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

    response.status(status).json(body);
  }
}
