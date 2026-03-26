process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://hephaistos:hephaistos_dev@localhost:5432/hephaistos';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-jwt-secret-minimum-32-characters-long';
