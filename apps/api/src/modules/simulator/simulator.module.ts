import { Module } from '@nestjs/common';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { OrderbookService } from './orderbook.service';

@Module({
  controllers: [SimulatorController],
  providers: [SimulatorService, OrderbookService],
})
export class SimulatorModule {}
