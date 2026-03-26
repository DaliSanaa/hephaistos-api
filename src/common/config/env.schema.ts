import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  MANGOPAY_CLIENT_ID: z.string().default(''),
  MANGOPAY_API_KEY: z.string().default(''),
  MANGOPAY_BASE_URL: z
    .string()
    .url()
    .default('https://api.sandbox.mangopay.com'),

  TYPESENSE_HOST: z.string().default('localhost'),
  TYPESENSE_PORT: z.coerce.number().default(8108),
  TYPESENSE_API_KEY: z.string().default(''),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default('hephaistos-media'),
  R2_PUBLIC_URL: z.string().default(''),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  /** Optional second web origin allowed by CORS (e.g. broker app). Empty = skip. */
  BROKER_APP_URL: z.string().default(''),

  APP_VERSION: z.string().default('0.0.1'),

  /** Base URL for sitemap index loc entries (no trailing slash). Empty = FRONTEND_URL + /api/v1 */
  PUBLIC_API_BASE_URL: z.string().default(''),

  INDEXNOW_KEY: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM_EMAIL: z.string().default(''),

  DISABLE_CRON_JOBS: z.coerce.boolean().default(false),

  ENABLE_MANGOPAY: z.coerce.boolean().default(false),
  ENABLE_TYPESENSE: z.coerce.boolean().default(false),
  ENABLE_R2: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;
