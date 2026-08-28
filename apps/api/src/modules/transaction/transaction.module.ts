import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';

@Module({
  controllers: [TransactionController, GraphController],
  providers: [TransactionService, GraphService],
  exports: [TransactionService, GraphService],
})
export class TransactionModule {}
