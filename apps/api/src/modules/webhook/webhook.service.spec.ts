import { WebhookService } from './webhook.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WEBHOOK_TEMPLATES } from './webhook-templates';

const lookupMock = jest.fn();
jest.mock('dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

function mockRedis() {
  return {
    connect: jest.fn(),
    quit: jest.fn(),
    lPush: jest.fn(),
    lTrim: jest.fn(),
    lRange: jest.fn(),
    expire: jest.fn(),
  };
}

function mockConfig() {
  return {
    get: jest.fn(() => 'redis://localhost:6379'),
  };
}

function jsonResponse(body: unknown, init: { status?: number; headers?: [string, string][] } = {}) {
  return {
    status: init.status ?? 200,
    headers: {
      entries: () => init.headers ?? [['content-type', 'application/json']],
      get: (name: string) =>
        (init.headers ?? [['content-type', 'application/json']]).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        )?.[1] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('WebhookService', () => {
  let service: WebhookService;
  let redis: ReturnType<typeof mockRedis>;
  let config: ReturnType<typeof mockConfig>;

  beforeEach(() => {
    jest.restoreAllMocks();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34' }]); // public IP (example.com)
    redis = mockRedis();
    config = mockConfig();
    service = new WebhookService(config as any);
    (service as any).redisClient = redis;
  });

  describe('getTemplates', () => {
    it('returns all webhook templates', () => {
      const templates = service.getTemplates();
      expect(templates).toBe(WEBHOOK_TEMPLATES);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('includes crowdpay and fluxa templates', () => {
      const templates = service.getTemplates();
      const providers = [...new Set(templates.map((t) => t.provider))];
      expect(providers).toContain('crowdpay');
      expect(providers).toContain('fluxa');
    });
  });

  describe('sendWebhook', () => {
    it('sends a webhook and stores entry in Redis under a user-namespaced key', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ success: true }));

      const result = await service.sendWebhook(USER_A, {
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
      });

      expect(result.endpointUrl).toBe('https://example.com/hook');
      expect(result.eventType).toBe('campaign.funded');
      expect(result.userId).toBe(USER_A);
      expect(result.statusCode).toBe(200);
      expect(result.id).toBeDefined();
      expect(redis.lPush).toHaveBeenCalledWith(
        `webhook_history:${USER_A}`,
        expect.any(String),
      );
      expect(redis.lTrim).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });

    it('includes HMAC signature when secret is provided', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, { headers: [] }));

      const result = await service.sendWebhook(USER_A, {
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
        secret: 'my-secret',
      });

      expect(result.requestHeaders['X-SaviTools-Signature']).toMatch(/^sha256=/);
    });

    it('throws for unknown event type without custom payload', async () => {
      await expect(
        service.sendWebhook(USER_A, {
          endpointUrl: 'https://example.com/hook',
          eventType: 'nonexistent.event',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sends custom payload for unknown event type', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, { headers: [] }));

      const result = await service.sendWebhook(USER_A, {
        endpointUrl: 'https://example.com/hook',
        eventType: 'custom.event',
        payload: { foo: 'bar' },
      });

      expect(result.payload).toEqual({ foo: 'bar' });
    });

    it('records error when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.sendWebhook(USER_A, {
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
      });

      expect(result.error).toBe('Network error');
      expect(result.statusCode).toBeNull();
    });

    it('rejects destinations that resolve to a private address (SSRF)', async () => {
      lookupMock.mockResolvedValue([{ address: '169.254.169.254' }]);
      global.fetch = jest.fn();

      await expect(
        service.sendWebhook(USER_A, {
          endpointUrl: 'https://metadata.internal/hook',
          eventType: 'campaign.funded',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects a literal loopback/private IP destination', async () => {
      global.fetch = jest.fn();

      await expect(
        service.sendWebhook(USER_A, {
          endpointUrl: 'http://127.0.0.1:8080/hook',
          eventType: 'campaign.funded',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('re-validates and follows a redirect to a public host', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(null, { status: 302, headers: [['location', 'https://example.com/final']] }),
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const result = await service.sendWebhook(USER_A, {
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        expect.any(URL),
        expect.objectContaining({ redirect: 'manual' }),
      );
      expect(result.statusCode).toBe(200);
    });

    it('blocks a redirect that points at a private address', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce(
        jsonResponse(null, {
          status: 302,
          headers: [['location', 'http://169.254.169.254/latest/meta-data']],
        }),
      );

      await expect(
        service.sendWebhook(USER_A, {
          endpointUrl: 'https://example.com/hook',
          eventType: 'campaign.funded',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('redacts sensitive response headers before storing/returning', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(
          { ok: true },
          {
            headers: [
              ['content-type', 'application/json'],
              ['set-cookie', 'session=super-secret'],
            ],
          },
        ),
      );

      const result = await service.sendWebhook(USER_A, {
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
      });

      expect(result.responseHeaders['set-cookie']).toBe('[REDACTED]');
    });
  });

  describe('getHistory', () => {
    it('returns parsed entries scoped to the requesting user', async () => {
      const entry = { id: '1', userId: USER_A, eventType: 'test' };
      redis.lRange.mockResolvedValue([JSON.stringify(entry)]);

      const result = await service.getHistory(USER_A);
      expect(result).toEqual([entry]);
      expect(redis.lRange).toHaveBeenCalledWith(`webhook_history:${USER_A}`, 0, -1);
    });

    it('does not read another user history key', async () => {
      redis.lRange.mockResolvedValue([]);

      await service.getHistory(USER_B);
      expect(redis.lRange).toHaveBeenCalledWith(`webhook_history:${USER_B}`, 0, -1);
      expect(redis.lRange).not.toHaveBeenCalledWith(`webhook_history:${USER_A}`, 0, -1);
    });

    it('returns empty array on error', async () => {
      redis.lRange.mockRejectedValue(new Error('Redis down'));

      const result = await service.getHistory(USER_A);
      expect(result).toEqual([]);
    });
  });

  describe('replay', () => {
    it('replays an existing webhook entry for the owning user', async () => {
      const entry = {
        id: 'entry-1',
        userId: USER_A,
        eventType: 'campaign.funded',
        endpointUrl: 'https://example.com/hook',
        payload: { data: 'test' },
      };
      redis.lRange.mockResolvedValue([JSON.stringify(entry)]);
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, { headers: [] }));

      const result = await service.replay('entry-1', USER_A);
      expect(result.eventType).toBe('campaign.funded');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ redirect: 'manual' }),
      );
    });

    it('throws NotFoundException when entry does not belong to the requesting user', async () => {
      redis.lRange.mockResolvedValue([]); // user B's key is empty even though user A has entries

      await expect(service.replay('entry-1', USER_B)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when entry not found', async () => {
      redis.lRange.mockResolvedValue([]);

      await expect(service.replay('nonexistent', USER_A)).rejects.toThrow(NotFoundException);
    });
  });
});
