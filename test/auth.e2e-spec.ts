import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
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

  it('POST /auth/register creates user (PRIVATE)', async () => {
    const email = `e2e-${Date.now()}@test.local`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Testpass1',
        firstName: 'E2E',
        lastName: 'User',
        userType: 'PRIVATE',
        countryCode: 'DE',
        acceptTerms: true,
      })
      .expect(201);

    const body = res.body as {
      success: boolean;
      data: { user: { email: string } };
    };
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(email);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('POST /auth/login accepts credentials', async () => {
    const email = `login-${Date.now()}@test.local`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Testpass1',
        firstName: 'A',
        lastName: 'B',
        userType: 'PRIVATE',
        countryCode: 'DE',
        acceptTerms: true,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Testpass1' })
      .expect(200);

    expect((res.body as { success: boolean }).success).toBe(true);
  });
});
