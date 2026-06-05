import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { LogType, Prisma } from '@prisma/client';
import { SystemLogService } from '../../system-log/system-log.service';
import { shouldSkipDbErrorLog } from '../constants/skip-db-log';

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

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  constructor(private readonly systemLog?: SystemLogService) {}

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

    if (request && !request.systemLogErrorRecorded && !shouldSkipDbErrorLog(request.method, request.originalUrl ?? request.url)) {
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
            prismaCode:
              exception instanceof Prisma.PrismaClientKnownRequestError
                ? exception.code
                : undefined,
          },
        },
        exception,
      );
      request.systemLogErrorRecorded = true;
    }

    response.status(status).json({
      success: false,
      message,
      data: null,
      ...(requestId !== undefined && { requestId }),
    });
  }
}
