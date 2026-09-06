import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class RequestContactCodeDto {
  // Exactly one of email/phone must be provided (the NEW contact value).
  @ValidateIf((o: RequestContactCodeDto) => o.phone === undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((o: RequestContactCodeDto) => o.email === undefined)
  @IsString()
  @IsOptional()
  phone?: string;
}
