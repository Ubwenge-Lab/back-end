import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBranchDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  @Transform(({ value }: { value: string }) => value?.trim())
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  branchManagerEmail: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}
