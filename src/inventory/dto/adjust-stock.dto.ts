import { IsInt, Min, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdjustStockDto {
  @IsInt({ message: 'New quantity must be an integer' })
  @Min(0, { message: 'Stock quantity cannot be negative' })
  @IsNotEmpty()
  newQuantity: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Please provide a clear reason for the adjustment' })
  reason: string;
}