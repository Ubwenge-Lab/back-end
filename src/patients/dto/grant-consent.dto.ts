import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrantConsentDto {
  @ApiProperty({
    description: 'Unique UUID of the doctor to grant 7-day medical history access rights to',
    example: '6c75357f-c94b-432f-af65-2da8a50d5f5c',
  })
  @IsUUID()
  @IsNotEmpty()
  doctorId: string;
}
export class VerifyConsentDto {
  @ApiProperty({
    description: 'Temporary access token to verify consent',
    example: 'uuid-token-string',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
