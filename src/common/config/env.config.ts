import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

export const EnvConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  validate: (config: Record<string, unknown>) => envSchema.parse(config),
});
