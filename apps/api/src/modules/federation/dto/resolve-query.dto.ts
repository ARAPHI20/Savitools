import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResolveQueryDto {
  @ApiProperty({
    description:
      'Stellar address (G…), federation address (alice*anchor.io), or domain',
    example: 'alice*stellar.org',
  })
  @IsString()
  @IsNotEmpty()
  address: string;
}
