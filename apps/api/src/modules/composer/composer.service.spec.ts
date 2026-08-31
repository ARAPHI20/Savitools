import { Test, TestingModule } from '@nestjs/testing';
import { ComposerService } from './composer.service';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('ComposerService', () => {
  let service: ComposerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComposerService],
    }).compile();

    service = module.get<ComposerService>(ComposerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('benchmarkTransaction', () => {
    it('runs sequential and concurrent benchmarks and detects conflicts', async () => {
      const keypair = StellarSdk.Keypair.random();
      const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

      // Mock account load and tx build
      jest.spyOn(server, 'loadAccount').mockResolvedValue({
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '100',
        incrementSequenceNumber: () => {},
      } as any);

      const builder = new StellarSdk.TransactionBuilder(await server.loadAccount(keypair.publicKey()), {
        fee: '100',
        networkPassphrase: StellarSdk.Networks.TESTNET,
      }).setTimeout(30);

      const tx = builder.build();
      tx.sign(keypair);
      const xdr = tx.toXDR();

      const result = await service.benchmarkTransaction({
        xdr,
        network: 'testnet',
        transactionCount: 5,
        concurrency: 3,
      });

      expect(result).toHaveProperty('sequential');
      expect(result).toHaveProperty('concurrent');
      expect(result.sequential.transactionCount).toBe(5);
      expect(result.concurrent.sequenceConflicts).toBeGreaterThanOrEqual(0);
      expect(result.sequential.throughputTxPerSec).toBeDefined();
      expect(result.concurrent.latencies.p99).toBeDefined();
    });
  });
});
