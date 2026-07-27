jest.mock('redis', () => {
  const mockRedisClient = {
    connect: jest.fn(),
    quit: jest.fn(),
    lPush: jest.fn(),
    lTrim: jest.fn(),
    lRange: jest.fn(),
    on: jest.fn(),
  };
  return {
    createClient: jest.fn(() => mockRedisClient),
    __mockRedisClient: mockRedisClient,
  };
});

import { NetworkService } from './network.service';
const { __mockRedisClient: mockRedisClient } = require('redis');

describe('NetworkService', () => {
  let service: NetworkService;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    service = new NetworkService({
      get: jest.fn(() => 'redis://localhost:6379'),
    } as any);
  });

  afterEach(() => {
    if ((service as any).pollInterval) {
      clearInterval((service as any).pollInterval);
    }
  });

  describe('getHistory', () => {
    it('returns reversed history from Redis', async () => {
      (service as any).redisClient = mockRedisClient;
      const entries = [
        JSON.stringify({ timestamp: 3, network: 'testnet' }),
        JSON.stringify({ timestamp: 2, network: 'testnet' }),
        JSON.stringify({ timestamp: 1, network: 'testnet' }),
      ];
      mockRedisClient.lRange.mockResolvedValue(entries);

      const result = await service.getHistory('testnet');

      expect(result).toHaveLength(3);
      expect(result[0].timestamp).toBe(1);
      expect(result[2].timestamp).toBe(3);
    });

    it('returns empty array on error', async () => {
      (service as any).redisClient = mockRedisClient;
      mockRedisClient.lRange.mockRejectedValue(new Error('Redis down'));

      const result = await service.getHistory('mainnet');
      expect(result).toEqual([]);
    });
  });

  describe('onModuleInit', () => {
    it('connects to Redis', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.lPush.mockResolvedValue(undefined);
      mockRedisClient.lTrim.mockResolvedValue(undefined);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              { sequence: 1, closed_at: new Date().toISOString() },
              { sequence: 0, closed_at: new Date(Date.now() - 5000).toISOString() },
            ],
          },
          fee_charged: { min: '100', mode: '100', max: '100', p10: '100', p50: '100', p90: '100', p99: '100' },
          last_ledger: 1,
          last_ledger_base_fee: '100',
        }),
      });

      await service.onModuleInit();
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('clears interval and quits Redis', async () => {
      (service as any).redisClient = mockRedisClient;
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      (service as any).pollInterval = setInterval(() => {}, 60000);

      await service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('handles missing redisClient gracefully', async () => {
      (service as any).redisClient = undefined;
      (service as any).pollInterval = undefined;

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
