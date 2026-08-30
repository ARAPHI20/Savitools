import { Module } from '@nestjs/common';
import { InspectorModule } from '../inspector/inspector.module';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';

@Module({
  imports: [InspectorModule],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
