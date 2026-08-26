import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SimulateFeeQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Number of operations' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  operations?: number = 1;

  @ApiPropertyOptional({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsString()
  @IsOptional()
  network?: string = 'testnet';
}
