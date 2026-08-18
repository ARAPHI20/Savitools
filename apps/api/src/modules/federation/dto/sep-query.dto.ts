import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SepQueryDto {
  @ApiProperty({
    description: 'Domain to inspect for SEP support',
    example: 'stellar.org',
  })
  @IsString()
  @IsNotEmpty()
  domain: string;
}
