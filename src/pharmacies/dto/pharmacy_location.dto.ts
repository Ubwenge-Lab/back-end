import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PharmacyLocationDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiPropertyOptional({ enum: ['MAIN', 'BRANCH'] })
  @IsEnum(['MAIN', 'BRANCH'])
  @IsOptional()
  locationType?: 'MAIN' | 'BRANCH';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pharmacyId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  branchId?: string | null;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty({ nullable: true })
  @IsNumber()
  @IsOptional()
  latitude: number | null;

  @ApiProperty({ nullable: true })
  @IsNumber()
  @IsOptional()
  longitude: number | null;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty({ nullable: true })
  @IsString()
  @IsOptional()
  region: string | null;

  @ApiProperty({ enum: ['OPEN', 'CLOSED'] })
  @IsEnum(['OPEN', 'CLOSED'])
  status: 'OPEN' | 'CLOSED';

  @ApiProperty()
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ nullable: true })
  @IsNumber()
  @IsOptional()
  distance: number | null;

  @ApiProperty({ nullable: true })
  @IsString()
  @IsOptional()
  hours: string | null;

  @ApiProperty({ nullable: true })
  @IsNumber()
  @IsOptional()
  rating: number | null;

  @ApiProperty({ type: [Object], isArray: true })
  @IsOptional()
  medications?: any[];
}
