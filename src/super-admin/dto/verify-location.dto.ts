import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyLocationDto {
  /** true = mark location as verified, false = flag as unverified */
  @ApiProperty()
  @IsBoolean()
  verified: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  note?: string;
}
