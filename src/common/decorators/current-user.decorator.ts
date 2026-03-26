import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUserPayload } from '../types/auth-user';

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUserPayload | undefined,
    ctx: ExecutionContext,
  ): AuthUserPayload | string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
