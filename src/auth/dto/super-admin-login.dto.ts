// backend/src/auth/dto/super-admin-login.dto.ts

import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuperAdminLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  secretKey: string;
}
