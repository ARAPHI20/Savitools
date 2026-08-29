import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FILTER_MAX_EVENTS = 1000;

export const EVENT_FILTER_KINDS = [
  'topic_contains',
  'value_type_is',
  'value_equals',
  'ledger_range',
] as const;

export class EventFilterCriterionDto {
  @ApiProperty({ enum: EVENT_FILTER_KINDS })
  @IsIn(EVENT_FILTER_KINDS)
  kind!: (typeof EVENT_FILTER_KINDS)[number];

  @ApiPropertyOptional({ description: 'Required for every kind except ledger_range.' })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower bound, ledger_range only.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  from?: number;

  @ApiPropertyOptional({ description: 'Inclusive upper bound, ledger_range only.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  to?: number;
}

export class FilterEventsDto {
  @ApiProperty({
    description: 'Decoded events, as returned by GET /contracts/events.',
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  @ArrayMaxSize(FILTER_MAX_EVENTS)
  events!: unknown[];

  @ApiProperty({ type: [EventFilterCriterionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventFilterCriterionDto)
  criteria!: EventFilterCriterionDto[];
}
