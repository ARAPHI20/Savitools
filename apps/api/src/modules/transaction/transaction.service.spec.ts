import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { InspectorService } from '../inspector/inspector.service';

const mockBreakdown = {
  hash: 'abc123',
  ledger: 1000,
  createdAt: '2024-01-01T00:00:00Z',
  sourceAccount: 'GABC',
  sequenceNumber: '1',
  feeCharged: '100',
  maxFee: '100',
  memo: null,
  memoType: 'none',
  timeBounds: null,
  signatures: [],
  success: true,
  resultCode: 'tx_success',
  resultExplanation: 'Transaction succeeded.',
  operationCount: 1,
  operations: [],
  rawJson: null,
  network: 'testnet',
  composerPayload: null,
};

describe('TransactionService', () => {
  let service: TransactionService;
  let inspectorService: jest.Mocked<InspectorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: InspectorService,
          useValue: {
            inspectTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    inspectorService = module.get(InspectorService);
  });

  describe('inspect', () => {
    it('delegates to InspectorService and returns a TransactionBreakdown', async () => {
      inspectorService.inspectTransaction.mockResolvedValue(mockBreakdown as any);

      const result = await service.inspect('abc123', 'testnet');

      expect(inspectorService.inspectTransaction).toHaveBeenCalledWith('abc123', 'testnet');
      expect(result).toBe(mockBreakdown);
    });

    it('defaults to testnet when network is omitted', async () => {
      inspectorService.inspectTransaction.mockResolvedValue(mockBreakdown as any);

      await service.inspect('abc123');

      expect(inspectorService.inspectTransaction).toHaveBeenCalledWith('abc123', 'testnet');
    });

    it('propagates NotFoundException from InspectorService', async () => {
      inspectorService.inspectTransaction.mockRejectedValue(
        new NotFoundException('Transaction abc123 not found on testnet'),
      );

      await expect(service.inspect('abc123', 'testnet')).rejects.toThrow(NotFoundException);
    });

    it('passes mainnet through to InspectorService', async () => {
      inspectorService.inspectTransaction.mockResolvedValue({
        ...mockBreakdown,
        network: 'mainnet',
      } as any);

      const result = await service.inspect('abc123', 'mainnet');

      expect(inspectorService.inspectTransaction).toHaveBeenCalledWith('abc123', 'mainnet');
      expect(result.network).toBe('mainnet');
    });
  });
});
