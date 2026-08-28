import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum GraphMode {
  SIGNERS = 'signers',
  OFFERS = 'offers',
  PAYMENTS = 'payments',
  ALL = 'all',
}

export class GraphQueryDto {
  @ApiProperty({
    description: 'Root Stellar public key to build the relationship graph from',
    example: 'GDK7RUYN2KBZ4B4B6AHX4RHB3C2FT3N3Z4G4X4X4X4X4X4X4X4X4X4X4X',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'rootAccount must be a valid Stellar public key (G... 56 chars)',
  })
  rootAccount!: string;

  @ApiProperty({
    description: 'Traversal depth (1–3). Higher depths explore more hops.',
    enum: [1, 2, 3],
  })
  @IsInt()
  @Min(1)
  @Max(3)
  depth!: number;

  @ApiProperty({
    description: 'Relationship mode to query',
    enum: GraphMode,
  })
  @IsEnum(GraphMode)
  mode!: GraphMode;

  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    description: 'Network to query (default: testnet)',
  })
  @IsOptional()
  @IsEnum(['mainnet', 'testnet'])
  network?: 'mainnet' | 'testnet';
}
