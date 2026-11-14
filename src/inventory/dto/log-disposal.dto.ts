import { IsInt, Min, IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';

export class LogDisposalDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsString()
  @IsIn(['Hospital Consumable', 'Hospital Drug', 'Pharmacy Medication'])
  itemType: string;

  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
