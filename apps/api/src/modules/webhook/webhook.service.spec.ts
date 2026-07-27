import { WebhookService } from './webhook.service';
import { BadRequestException } from '@nestjs/common';
import { WEBHOOK_TEMPLATES } from './webhook-templates';

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

describe('WebhookService', () => {
  let service: WebhookService;
  let redis: ReturnType<typeof mockRedis>;
  let config: ReturnType<typeof mockConfig>;

  beforeEach(() => {
    jest.restoreAllMocks();
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
    it('sends a webhook and stores entry in Redis', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: { entries: () => [['content-type', 'application/json']] },
        json: async () => ({ success: true }),
        text: async () => '',
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.sendWebhook({
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
      });

      expect(result.endpointUrl).toBe('https://example.com/hook');
      expect(result.eventType).toBe('campaign.funded');
      expect(result.statusCode).toBe(200);
      expect(result.id).toBeDefined();
      expect(redis.lPush).toHaveBeenCalled();
      expect(redis.lTrim).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });

    it('includes HMAC signature when secret is provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: { entries: () => [] },
        json: async () => ({}),
        text: async () => '',
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.sendWebhook({
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
        secret: 'my-secret',
      });

      expect(result.requestHeaders['X-SaviTools-Signature']).toMatch(/^sha256=/);
    });

    it('throws for unknown event type without custom payload', async () => {
      await expect(
        service.sendWebhook({
          endpointUrl: 'https://example.com/hook',
          eventType: 'nonexistent.event',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sends custom payload for unknown event type', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: { entries: () => [] },
        json: async () => ({}),
        text: async () => '',
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.sendWebhook({
        endpointUrl: 'https://example.com/hook',
        eventType: 'custom.event',
        payload: { foo: 'bar' },
      });

      expect(result.payload).toEqual({ foo: 'bar' });
    });

    it('records error when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.sendWebhook({
        endpointUrl: 'https://example.com/hook',
        eventType: 'campaign.funded',
      });

      expect(result.error).toBe('Network error');
      expect(result.statusCode).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('returns parsed entries from Redis', async () => {
      const entry = { id: '1', eventType: 'test' };
      redis.lRange.mockResolvedValue([JSON.stringify(entry)]);

      const result = await service.getHistory();
      expect(result).toEqual([entry]);
    });

    it('returns empty array on error', async () => {
      redis.lRange.mockRejectedValue(new Error('Redis down'));

      const result = await service.getHistory();
      expect(result).toEqual([]);
    });
  });

  describe('replay', () => {
    it('replays an existing webhook entry', async () => {
      const entry = {
        id: 'entry-1',
        eventType: 'campaign.funded',
        endpointUrl: 'https://example.com/hook',
        payload: { data: 'test' },
      };
      redis.lRange.mockResolvedValue([JSON.stringify(entry)]);

      const mockResponse = {
        ok: true,
        status: 200,
        headers: { entries: () => [] },
        json: async () => ({}),
        text: async () => '',
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await service.replay('entry-1');
      expect(result.eventType).toBe('campaign.funded');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.any(Object),
      );
    });

    it('throws when entry not found', async () => {
      redis.lRange.mockResolvedValue([]);

      await expect(service.replay('nonexistent')).rejects.toThrow(BadRequestException);
    });
  });
});
