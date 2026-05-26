import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDrugStockDto {
  @ApiPropertyOptional({ example: 100, description: 'New quantity on hand' })
  @IsOptional()
  @IsInt()
  @Min(0)
  qtyOnHand?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Quantity at which low-stock alert triggers',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;
}
