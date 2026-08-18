import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { VaultKeyProvider } from '../entities/vault-key.entity';

export class CreateVaultKeyDto {
  @ApiProperty({ example: 'My Fluxa key' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: VaultKeyProvider })
  @IsEnum(VaultKeyProvider)
  provider!: VaultKeyProvider;

  @ApiProperty({ description: 'The raw API key to store (will be encrypted at rest)' })
  @IsString()
  @MinLength(1)
  key!: string;
}
