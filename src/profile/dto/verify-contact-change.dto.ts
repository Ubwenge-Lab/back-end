import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class VerifyContactChangeDto {
  @ValidateIf((o: VerifyContactChangeDto) => o.phone === undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((o: VerifyContactChangeDto) => o.email === undefined)
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: '48291' })
  @IsString()
  code: string;
}
