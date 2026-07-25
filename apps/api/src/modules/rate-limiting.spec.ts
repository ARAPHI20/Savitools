import { Controller, Get } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

@Controller('test')
class TestController {
  @Get()
  test() {
    return { success: true };
  }
}

describe('Rate Limiting', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{
          ttl: 60000,
          limit: 2, // Low limit for testing
        }]),
      ],
      controllers: [TestController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should allow requests up to the limit and then throw 429', async () => {
    // First request - should be 200
    const res1 = await app.inject({
      method: 'GET',
      url: '/test',
    });
    expect(res1.statusCode).toBe(200);

    // Second request - should be 200
    const res2 = await app.inject({
      method: 'GET',
      url: '/test',
    });
    expect(res2.statusCode).toBe(200);

    // Third request - should exceed limit and be 429
    const res3 = await app.inject({
      method: 'GET',
      url: '/test',
    });
    expect(res3.statusCode).toBe(429);
  });
});
