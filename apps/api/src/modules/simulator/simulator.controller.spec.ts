import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { OrderbookService } from './orderbook.service';
import { FindPathsDto, Direction, AssetType } from './dto/find-paths.dto';

describe('SimulatorController', () => {
  it('passes the complete DTO to the service without manual casting or defaults', async () => {
    const service = { findPaths: jest.fn().mockResolvedValue([]) } as unknown as SimulatorService;
    const controller = new SimulatorController(service, {} as OrderbookService);
    const dto: FindPathsDto = {
      direction: Direction.STRICT_SEND,
      source_asset_type: AssetType.NATIVE,
      amount: '1.5',
      destination_asset_type: AssetType.NATIVE,
      network: 'testnet',
    };

    await controller.findPaths(dto);

    expect(service.findPaths).toHaveBeenCalledWith(dto);
  });
});
