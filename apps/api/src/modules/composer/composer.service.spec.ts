import { ComposerService, OPERATION_MANIFEST } from './composer.service';
import { Horizon, Networks, TransactionBuilder, Account, Asset } from '@stellar/stellar-sdk';

describe('ComposerService', () => {
  let service: ComposerService;

  beforeEach(() => {
    service = new ComposerService();
  });

  describe('getOperations', () => {
    it('returns the operation manifest', () => {
      const result = service.getOperations();
      expect(result).toBe(OPERATION_MANIFEST);
    });

    it('includes payment operation', () => {
      const ops = service.getOperations();
      const payment = ops.find((op) => op.type === 'payment');
      expect(payment).toBeDefined();
      expect(payment!.label).toBe('Payment');
      expect(payment!.fields.length).toBeGreaterThan(0);
    });

    it('includes all 12 operation types', () => {
      const ops = service.getOperations();
      expect(ops).toHaveLength(12);

      const types = ops.map((op) => op.type);
      expect(types).toContain('payment');
      expect(types).toContain('create_account');
      expect(types).toContain('change_trust');
      expect(types).toContain('manage_sell_offer');
      expect(types).toContain('manage_buy_offer');
      expect(types).toContain('create_passive_sell_offer');
      expect(types).toContain('set_options');
      expect(types).toContain('account_merge');
      expect(types).toContain('allow_trust');
      expect(types).toContain('path_payment_strict_send');
      expect(types).toContain('path_payment_strict_receive');
      expect(types).toContain('manage_data');
    });

    it('each operation has required metadata', () => {
      const ops = service.getOperations();
      for (const op of ops) {
        expect(op.type).toBeDefined();
        expect(op.label).toBeDefined();
        expect(op.description).toBeDefined();
        expect(Array.isArray(op.fields)).toBe(true);
        for (const field of op.fields) {
          expect(field.name).toBeDefined();
          expect(field.label).toBeDefined();
          expect(field.type).toBeDefined();
          expect(typeof field.required).toBe('boolean');
        }
      }
    });
  });

  describe('simulateTransaction', () => {
    it('returns a hash for valid XDR without submitting', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const tx = new TransactionBuilder(account, {
        networkPassphrase: Networks.TESTNET,
        fee: '100',
      })
        .addOperation(
          TransactionBuilder.payment({
            destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
            asset: Asset.native(),
            amount: '1',
          }),
        )
        .setTimeout(30)
        .build();
      const xdr = tx.toEnvelope().toXDR().toString('base64');

      const submitSpy = jest.spyOn(Horizon.Server.prototype, 'submitTransaction');

      const result = await service.simulateTransaction({ xdr, network: 'testnet' });

      expect(submitSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.hash).toBe(tx.hash().toString('hex'));
      expect(result.fee).toBeNull();
      expect(result.resultCodes).toBeNull();
      expect(result.operationResults).toBeNull();
      expect(result.ledger).toBeNull();

      submitSpy.mockRestore();
    });

    it('throws on invalid XDR', async () => {
      await expect(
        service.simulateTransaction({ xdr: 'not-valid-xdr', network: 'testnet' }),
      ).rejects.toThrow('Invalid XDR');
    });

    it('caches simulation results and evicts when cache is full', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const max = 1000;
      // Simulate more than MAX_CACHE_SIZE items to trigger eviction
      for (let i = 0; i <= max + 10; i++) {
        const tx = new TransactionBuilder(account, {
          networkPassphrase: Networks.TESTNET,
          fee: '100',
        })
          .addOperation(
            TransactionBuilder.payment({
              destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
              asset: Asset.native(),
              amount: String(i + 1),
            }),
          )
          .setTimeout(30)
          .build();
        const xdr = tx.toEnvelope().toXDR().toString('base64');
        await service.simulateTransaction({ xdr, network: 'testnet' });
      }

      const cacheSize = (service as any).simulationCache.size;
      expect(cacheSize).toBeLessThanOrEqual(max);
    });

    it('expires cache entries based on TTL', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const tx = new TransactionBuilder(account, {
        networkPassphrase: Networks.TESTNET,
        fee: '100',
      })
        .addOperation(
          TransactionBuilder.payment({
            destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
            asset: Asset.native(),
            amount: '50',
          }),
        )
        .setTimeout(30)
        .build();
      const xdr = tx.toEnvelope().toXDR().toString('base64');

      await service.simulateTransaction({ xdr, network: 'testnet' });
      const cacheKey = `testnet:${xdr}`;

      // Force expire by shifting expiresAt into the past
      const cached = (service as any).simulationCache.get(cacheKey);
      expect(cached).toBeDefined();
      cached.expiresAt = Date.now() - 1000;

      // Re-simulating should successfully re-evaluate / overwrite expired cache entry
      const result = await service.simulateTransaction({ xdr, network: 'testnet' });
      expect(result.success).toBe(true);
    });
  });

  describe('sendTransaction', () => {
    it('submits the transaction to Horizon', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const tx = new TransactionBuilder(account, {
        networkPassphrase: Networks.TESTNET,
        fee: '100',
      })
        .addOperation(
          TransactionBuilder.payment({
            destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
            asset: Asset.native(),
            amount: '1',
          }),
        )
        .setTimeout(30)
        .build();
      const xdr = tx.toEnvelope().toXDR().toString('base64');

      const mockResult = {
        hash: 'abc123',
        fee_charged: 100,
        ledger: 12345,
      };

      const submitSpy = jest
        .spyOn(Horizon.Server.prototype, 'submitTransaction')
        .mockResolvedValue(mockResult as any);

      const result = await service.sendTransaction({ xdr, network: 'testnet' });

      expect(submitSpy).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.hash).toBe('abc123');
      expect(result.fee).toBe(100);
      expect(result.ledger).toBe(12345);

      submitSpy.mockRestore();
    });

    it('returns failure result codes on Horizon rejection', async () => {
      const account = new Account('GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ', '1');
      const tx = new TransactionBuilder(account, {
        networkPassphrase: Networks.TESTNET,
        fee: '100',
      })
        .addOperation(
          TransactionBuilder.payment({
            destination: 'GCEXAMPLE5R6N3K6Y5XZ5QZ5QZ5QZ5QZ5QZ5QZ5QZ',
            asset: Asset.native(),
            amount: '1',
          }),
        )
        .setTimeout(30)
        .build();
      const xdr = tx.toEnvelope().toXDR().toString('base64');

      const horizonError = new Error('Bad request') as any;
      horizonError.response = {
        data: {
          extras: {
            result_codes: {
              transaction: 'tx_bad_seq',
              operations: ['op_bad_auth'],
            },
          },
        },
      };

      const submitSpy = jest
        .spyOn(Horizon.Server.prototype, 'submitTransaction')
        .mockRejectedValue(horizonError);

      const result = await service.sendTransaction({ xdr, network: 'testnet' });

      expect(submitSpy).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.hash).toBeNull();
      expect(result.resultCodes).toBe('tx_bad_seq');
      expect(result.operationResults).toEqual(['op_bad_auth']);

      submitSpy.mockRestore();
    });
  });
});
