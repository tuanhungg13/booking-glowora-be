import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.BAD_REQUEST;
    let error = 'PrismaError';
    let message: string = 'Database error';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          error = 'UniqueConstraintViolation';
          message = 'Resource with given unique field already exists';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          error = 'ForeignKeyViolation';
          message = 'Invalid relation reference';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          error = 'RecordNotFound';
          message = 'Requested record was not found';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          error = `PrismaError_${exception.code}`;
          message = exception.message;
      }
    } else {
      // Validation error
      status = HttpStatus.BAD_REQUEST;
      error = 'PrismaValidationError';
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

