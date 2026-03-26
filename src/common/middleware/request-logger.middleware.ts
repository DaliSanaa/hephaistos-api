import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUserPayload } from '../types/auth-user';

type ReqWithUser = Request & { user?: AuthUserPayload };

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const r = req as ReqWithUser;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const log = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userId: r.user?.sub ?? 'anonymous',
      };

      if (res.statusCode >= 400) {
        this.logger.error(JSON.stringify(log));
      } else if (duration > 1000) {
        this.logger.warn(JSON.stringify({ ...log, slow: true }));
      }
    });

    next();
  }
}
