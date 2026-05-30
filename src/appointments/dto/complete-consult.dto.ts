import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsNumber,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConsultItemDto {
  @ApiProperty({ example: 'Lab test' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 5000, description: 'Unit cost in RWF' })
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CompleteConsultDto {
  @ApiProperty({ example: 'Acute pharyngitis' })
  @IsString()
  @IsNotEmpty()
  diagnosisSummary: string;

  @ApiProperty({ example: 'Rest and drink warm fluids.' })
  @IsString()
  @IsNotEmpty()
  doctorRecommendations: string;

  @ApiPropertyOptional({ example: 'Patient responded well to treatment' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [ConsultItemDto],
    description: 'Additional line items beyond consultation/triage fees seeded from hospital config',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsultItemDto)
  items?: ConsultItemDto[];
}
