import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUserPayload } from '../types/auth-user';

/** Sets `req.user` when a valid `hephaistos_token` cookie is present; never throws. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      cookies?: { hephaistos_token?: string };
      user?: AuthUserPayload;
    }>();
    const token = req.cookies?.hephaistos_token;
    if (!token) {
      req.user = undefined;
      return true;
    }
    try {
      const payload = this.jwt.verify<AuthUserPayload>(token);
      req.user = payload;
    } catch {
      req.user = undefined;
    }
    return true;
  }
}
