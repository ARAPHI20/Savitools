import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class RegisterWebhookDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  url!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(512)
  secret!: string;
}
