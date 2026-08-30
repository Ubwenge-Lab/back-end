import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ example: 'info@ubwengelab.rw' })
  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @ApiPropertyOptional({ example: '+250 800 000 000' })
  @IsOptional()
  @IsString()
  supportPhone?: string;

  @ApiPropertyOptional({ example: 'Customer Care' })
  @IsOptional()
  @IsString()
  supportName?: string;
}
