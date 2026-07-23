import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiKeyProvider } from '../entities/api-key.entity';

export class ListHistoryDto {
  @ApiPropertyOptional({ enum: ApiKeyProvider, description: 'Filter by provider' })
  @IsOptional()
  @IsEnum(ApiKeyProvider)
  provider?: ApiKeyProvider;

  @ApiPropertyOptional({ description: 'Max number of entries to return', default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of entries to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
