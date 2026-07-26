import { SimulatorService } from './simulator.service';
import { BadRequestException } from '@nestjs/common';

describe('SimulatorService', () => {
  let service: SimulatorService;

  beforeEach(() => {
    jest.restoreAllMocks();
    service = new SimulatorService();
  });

  describe('simulateFee', () => {
    it('returns fee stats from Horizon', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          last_ledger_base_fee: '100',
          fee_charged: { p10: '100', p50: '200', p90: '500', p99: '1000' },
          last_ledger: 12345,
        }),
      });

      const result = await service.simulateFee(3, 'testnet');

      expect(result.network).toBe('testnet');
      expect(result.operations).toBe(3);
      expect(result.baseFeeStroops).toBe(100);
      expect(result.totalFeeStroops).toBe(300);
      expect(result.totalFeeXlm).toBe('0.0000300');
      expect(result.lastLedger).toBe(12345);
    });

    it('throws for invalid network', async () => {
      await expect(service.simulateFee(1, 'invalid')).rejects.toThrow(BadRequestException);
    });

    it('throws on Horizon error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      });

      await expect(service.simulateFee(1, 'testnet')).rejects.toThrow(BadRequestException);
    });
  });

  describe('simulateStrictSend', () => {
    it('returns paths from Horizon', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                source_asset_type: 'native',
                source_amount: '100',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: 'GISSUER',
                destination_amount: '10',
                path: [],
              },
            ],
          },
        }),
      });

      const result = await service.simulateStrictSend({
        sourceAsset: 'XLM',
        sourceAmount: '100',
        destAsset: 'USDC:GISSUER',
        network: 'testnet',
      });

      expect(result.mode).toBe('strict_send');
      expect(result.totalPathsFound).toBe(1);
      expect(result.bestPath.destinationAmount).toBe('10');
    });

    it('throws when no paths found', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ _embedded: { records: [] } }),
      });

      await expect(
        service.simulateStrictSend({
          sourceAsset: 'XLM',
          sourceAmount: '100',
          destAsset: 'USDC:GISSUER',
          network: 'testnet',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('simulateStrictReceive', () => {
    it('returns paths from Horizon', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                source_asset_type: 'native',
                source_amount: '15',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: 'GISSUER',
                destination_amount: '10',
                path: [],
              },
            ],
          },
        }),
      });

      const result = await service.simulateStrictReceive({
        sourceAsset: 'XLM',
        destAsset: 'USDC:GISSUER',
        destAmount: '10',
        network: 'testnet',
      });

      expect(result.mode).toBe('strict_receive');
      expect(result.totalPathsFound).toBe(1);
      expect(result.sourceAmountNeeded).toBe('15');
    });
  });
});
