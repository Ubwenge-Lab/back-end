import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT',
}

export class HandoverChecklistDto {
  @ApiProperty({ description: 'All IV lines inspected and patent' })
  @IsBoolean()
  ivLinesChecked: boolean;

  @ApiProperty({ description: 'All medications reconciled against prescription chart' })
  @IsBoolean()
  medicationsReconciled: boolean;

  @ApiProperty({ description: 'Any pending lab results or imaging noted' })
  @IsBoolean()
  pendingLabsNoted: boolean;

  @ApiProperty({ description: 'Vital signs trend reviewed and documented' })
  @IsBoolean()
  vitalsTrending: boolean;

  @ApiProperty({ description: 'All bedside equipment checked and functional' })
  @IsBoolean()
  equipmentChecked: boolean;

  @ApiPropertyOptional({ example: 'Patient stable, comfortable, tolerating oral fluids' })
  @IsString()
  @IsOptional()
  patientConditionSummary?: string;

  @ApiPropertyOptional({ example: 'Awaiting morning electrolyte results' })
  @IsString()
  @IsOptional()
  pendingOrders?: string;

  @ApiPropertyOptional({ example: 'Fall risk — bed rails up at all times' })
  @IsString()
  @IsOptional()
  alertFlags?: string;
}

export class CreateHandoverDto {
  @ApiProperty({ enum: ShiftType, example: ShiftType.NIGHT })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiProperty({ type: HandoverChecklistDto })
  @ValidateNested()
  @Type(() => HandoverChecklistDto)
  checklist: HandoverChecklistDto;

  @ApiPropertyOptional({ example: 'Quiet night overall, patient resting well' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'HospitalStaff.id of the incoming nurse (if known at handover time)',
    example: 'staff-uuid',
  })
  @IsString()
  @IsOptional()
  incomingNurseId?: string;
}
