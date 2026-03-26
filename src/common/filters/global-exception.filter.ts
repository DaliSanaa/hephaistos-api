import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    let errorExtra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'retryAfterSec' in res) {
        const ra = (res as { retryAfterSec?: number }).retryAfterSec;
        if (typeof ra === 'number') {
          response.setHeader('Retry-After', String(ra));
        }
      }
      message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res && 'message' in res
            ? (() => {
                const m = (res as { message: unknown }).message;
                if (Array.isArray(m)) return m.join(', ');
                return String(m);
              })()
            : exception.message;
      if (
        typeof res === 'object' &&
        res !== null &&
        'code' in res &&
        typeof (res as { code: unknown }).code === 'string'
      ) {
        code = (res as { code: string }).code;
        const r = res as { action?: string };
        if (typeof r.action === 'string') {
          errorExtra = { action: r.action };
        }
      } else {
        code = `HTTP_${status}`;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'A record with this value already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Record not found';
      } else {
        message = 'Database error';
        code = exception.code;
      }
    } else if (exception instanceof Error) {
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message;
      this.logger.error(exception.stack);
    }

    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      this.logger.error(exception.stack);
    }

    response.status(status).json({
      success: false,
      error: { code, message, ...errorExtra },
    });
  }
}
