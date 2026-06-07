import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyPrescriptionDto {
  @ApiPropertyOptional({ example: 'EVUZE-PRESC-2026-123456' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    example: '{"id":"EVUZE-PRESC-2026-123456","hash":"some-sha256-hash"}',
  })
  @IsString()
  @IsOptional()
  qrCodePayload?: string;
}
