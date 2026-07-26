import { TransactionService } from './transaction.service';
import { NotFoundException } from '@nestjs/common';

describe('TransactionService', () => {
  let service: TransactionService;

  beforeEach(() => {
    service = new TransactionService();
  });

  describe('inspect', () => {
    it('throws NotFoundException for any hash', async () => {
      await expect(service.inspect('abc123')).rejects.toThrow(NotFoundException);
    });

    it('includes the hash in the error message', async () => {
      try {
        await service.inspect('my-hash');
      } catch (err) {
        expect(err.message).toContain('my-hash');
      }
    });
  });
});
