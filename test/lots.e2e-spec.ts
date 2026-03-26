import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('Lots browse (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /lots returns paginated shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/lots')
      .expect(200);

    const body = res.body as {
      success: boolean;
      data: { items: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.items).toBeInstanceOf(Array);
  });

  it('GET /verticals returns data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/verticals')
      .expect(200);

    const body = res.body as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
