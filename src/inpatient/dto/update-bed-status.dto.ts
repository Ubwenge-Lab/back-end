import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BedStatus } from '@prisma/client';

export class UpdateBedStatusDto {
  @ApiProperty({ enum: BedStatus, example: 'MAINTENANCE' })
  @IsEnum(BedStatus)
  @IsNotEmpty()
  status: BedStatus;

  @ApiPropertyOptional({ example: 'Broken hydraulic frame awaiting repair' })
  @IsString()
  @IsOptional()
  notes?: string;
}
