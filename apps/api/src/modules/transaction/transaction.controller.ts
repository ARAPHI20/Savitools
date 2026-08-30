import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':hash')
  @ApiOperation({ summary: 'Decode and inspect a Stellar transaction by hash' })
  @ApiParam({ name: 'hash', description: 'Transaction hash (64 hex chars)' })
  @ApiQuery({ name: 'network', required: false, enum: ['testnet', 'mainnet'] })
  @ApiResponse({ status: 200, description: 'Transaction details retrieved' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  inspect(
    @Param('hash') hash: string,
    @Query('network') network?: 'testnet' | 'mainnet',
  ) {
    return this.transactionService.inspect(hash, network ?? 'testnet');
  }
}
