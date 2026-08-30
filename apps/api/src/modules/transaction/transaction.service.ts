import { Injectable } from '@nestjs/common';
import { InspectorService, TransactionBreakdown } from '../inspector/inspector.service';

@Injectable()
export class TransactionService {
  constructor(private readonly inspectorService: InspectorService) {}

  async inspect(
    hash: string,
    network: 'testnet' | 'mainnet' = 'testnet',
  ): Promise<TransactionBreakdown> {
    return this.inspectorService.inspectTransaction(hash, network);
  }
}
