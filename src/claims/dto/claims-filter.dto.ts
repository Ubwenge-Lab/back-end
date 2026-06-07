import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export class ClaimsFilterDto {
  @ApiPropertyOptional({
    description: 'Filter claims by insurance provider',
    example: 'RSSB-Test',
  })
  @IsOptional()
  @IsString()
  provider?: string;
  @ApiPropertyOptional({
    description: 'Filter claims by status (PENDING, PAID, PARTIAL, REJECTED)',
    example: 'PENDING',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
