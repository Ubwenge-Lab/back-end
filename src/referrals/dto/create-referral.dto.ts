import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty({ description: 'Patient being referred' })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ description: 'Hospital the patient is being referred to' })
  @IsUUID()
  @IsNotEmpty()
  targetHospitalId: string;

  @ApiProperty({ description: 'Clinical reason for the referral' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
