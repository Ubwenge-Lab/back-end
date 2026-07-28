import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHospitalDto {
  @ApiPropertyOptional({ example: 'King Faisal Hospital' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'KG 544 St, Kigali' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone?: string;

  // NOTE: email is intentionally not included here. Hospital.email does not
  // exist as a column — HospitalDto's `email` field is sourced from the
  // linked User.email (see HospitalsService.findOne()). Updating it would
  // mean touching the User/auth domain (uniqueness checks, re-verification
  // flows, etc.), which is out of scope for this settings-profile patch. See
  // src/docs (frontend) HOSPITAL_ADMIN_REPORTS_SETTINGS_INTEGRATION.md.
}
