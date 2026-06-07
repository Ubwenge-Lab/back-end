import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID } from 'class-validator';

export class ConsultationSessionDto {
  @ApiProperty({ example: 'uuid-of-user', description: 'User UUID' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'DOCTOR', enum: ['DOCTOR', 'PATIENT'] })
  @IsEnum(['DOCTOR', 'PATIENT'])
  role: 'DOCTOR' | 'PATIENT';

  @ApiProperty({ example: 'JOIN', enum: ['JOIN', 'LEAVE'] })
  @IsEnum(['JOIN', 'LEAVE'])
  action: 'JOIN' | 'LEAVE';
}
