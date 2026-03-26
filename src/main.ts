import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const brokerUrl = process.env.BROKER_APP_URL?.trim();
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [frontendUrl, brokerUrl].filter((u): u is string =>
        Boolean(u),
      );
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  });

  const config = new DocumentBuilder()
    .setTitle('Hephaistos API')
    .setDescription('Industrial equipment auction marketplace API')
    .setVersion('1.0')
    .addCookieAuth('hephaistos_token')
    .addTag('auth', 'Registration, login, password reset')
    .addTag('users', 'Profile, settings, KYC, payment validation')
    .addTag('verticals', 'Verticals and categories')
    .addTag('lots', 'Browse, detail, create, update')
    .addTag('seller', 'Seller listings')
    .addTag('auctions', 'Bid placement and bid history')
    .addTag('transactions', 'Payment, escrow, disputes')
    .addTag('watchlist', 'Watchlist')
    .addTag('notifications', 'Notifications')
    .addTag('search', 'Search and suggestions')
    .addTag('media', 'Presigned uploads')
    .addTag('admin', 'Admin dashboard and moderation')
    .addTag('system', 'Health, feeds, sitemap, geo')
    .addTag('webhooks', 'Payment provider webhooks')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}
void bootstrap();
