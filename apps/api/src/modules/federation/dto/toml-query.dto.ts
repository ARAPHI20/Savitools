import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TomlQueryDto {
  @ApiProperty({
    description: 'Domain to fetch stellar.toml from',
    example: 'stellar.org',
  })
  @IsString()
  @IsNotEmpty()
  domain: string;
}
