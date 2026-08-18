import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderbookQueryDto {
  @ApiProperty({ example: 'XLM', description: 'Selling asset (XLM or CODE:ISSUER)' })
  @IsString()
  selling: string;

  @ApiProperty({
    example: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    description: 'Buying asset (XLM or CODE:ISSUER)',
  })
  @IsString()
  buying: string;

  @ApiPropertyOptional({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsIn(['testnet', 'mainnet'])
  @IsOptional()
  network?: 'testnet' | 'mainnet' = 'testnet';
}
