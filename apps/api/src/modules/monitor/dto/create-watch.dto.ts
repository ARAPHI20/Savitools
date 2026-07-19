import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ALERT_RULE_TYPES,
  AlertRuleType,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
  StellarNetwork,
  WATCH_EVENT_TYPES,
  WatchEventType,
} from '../monitor.types';

export class AlertRuleDto {
  @IsIn(ALERT_RULE_TYPES)
  type!: AlertRuleType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  asset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  threshold?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(NOTIFICATION_CHANNELS, { each: true })
  channels?: NotificationChannel[];
}

export class CreateWatchDto {
  @IsString()
  @MaxLength(128)
  publicKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WATCH_EVENT_TYPES, { each: true })
  eventTypes!: WatchEventType[];

  @IsOptional()
  @IsIn(['testnet', 'public'])
  network?: StellarNetwork;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlertRuleDto)
  alertRules?: AlertRuleDto[];
}
