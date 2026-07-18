import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

type LoggableRequest = {
  requestId?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  user?: { id?: string };
};

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<LoggableRequest>();
    const requestId = request?.requestId;

    let status = HttpStatus.BAD_REQUEST;
    let message = 'Lỗi cơ sở dữ liệu';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Dữ liệu đã tồn tại (vi phạm ràng buộc unique)';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Tham chiếu quan hệ không hợp lệ';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Không tìm thấy bản ghi';
          break;
        default:
          message = 'Lỗi cơ sở dữ liệu';
      }
    }

    const prismaCode =
      exception instanceof Prisma.PrismaClientKnownRequestError ? exception.code : undefined;
    this.logger.error(
      `[${requestId ?? '-'}] ${request?.method ?? ''} ${request?.originalUrl ?? request?.url ?? ''} ` +
        `prismaCode=${prismaCode ?? '-'} status=${status} ${exception.message}`,
      exception.stack,
    );

    response.status(status).json({
      success: false,
      message,
      data: null,
      ...(requestId !== undefined && { requestId }),
    });
  }
}
