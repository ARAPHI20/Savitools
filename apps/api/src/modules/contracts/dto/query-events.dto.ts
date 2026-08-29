import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export const EVENT_QUERY_MAX_LIMIT = 200;

export type EventQueryNetwork = 'testnet' | 'mainnet';
export type SorobanEventType = 'contract' | 'system' | 'diagnostic';

export class QueryEventsDto {
  @ApiProperty({ description: 'Soroban contract ID (C...)' })
  @IsString()
  contractId!: string;

  @ApiPropertyOptional({ enum: ['testnet', 'mainnet'], default: 'testnet' })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: EventQueryNetwork;

  @ApiPropertyOptional({
    description: 'Ledger sequence to begin from (inclusive). Mutually exclusive with cursor.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startLedger?: number;

  @ApiPropertyOptional({ description: 'Ledger sequence to stop at (exclusive).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  endLedger?: number;

  @ApiPropertyOptional({ description: 'Page cursor (exclusive). Mutually exclusive with startLedger.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 100, maximum: EVENT_QUERY_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EVENT_QUERY_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    enum: ['contract', 'system', 'diagnostic'],
    default: 'contract',
    description: 'RPC event type filter.',
  })
  @IsOptional()
  @IsIn(['contract', 'system', 'diagnostic'])
  type?: SorobanEventType;
}
