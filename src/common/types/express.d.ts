import type { AuthUserPayload } from './auth-user';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export {};
