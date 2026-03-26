import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit' as const;

export type RateLimitOptions = { max: number; window: number };

/** Overrides default max/window for this route; key is still derived from IP/user + path. */
export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);
