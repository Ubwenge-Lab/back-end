import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogSupplyDto {
  @ApiProperty({ example: 'Syringe 10mL' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiPropertyOptional({ example: 'CONSUMABLE' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 0.50 })
  @IsNumber()
  @Min(0)
  unitCost: number;
}
