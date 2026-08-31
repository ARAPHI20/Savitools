import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ComposerService } from './composer.service';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import { BenchmarkTransactionDto } from './dto/benchmark-transaction.dto';

@ApiTags('composer')
@Controller('composer')
export class ComposerController {
  constructor(private readonly composerService: ComposerService) {}

  @Post('build')
  @ApiOperation({ summary: 'Build and sign a Stellar transaction XDR' })
  @ApiResponse({ status: 201, description: 'Transaction built successfully' })
  async buildTransaction(@Body() dto: BuildTransactionDto) {
    return this.composerService.buildTransaction(dto);
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate a transaction envelope via Horizon' })
  @ApiResponse({ status: 200, description: 'Simulation completed' })
  async simulateTransaction(@Body() dto: SimulateTransactionDto) {
    return this.composerService.simulateTransaction(dto);
  }

  @Post('benchmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run sequential and concurrent transaction submission benchmarks' })
  @ApiResponse({ status: 200, description: 'Benchmark completed' })
  async benchmarkTransaction(@Body() dto: BenchmarkTransactionDto) {
    return this.composerService.benchmarkTransaction(dto);
  }
}
