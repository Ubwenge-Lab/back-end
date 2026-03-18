import { ApiProperty } from '@nestjs/swagger';

export class RevenuePointDto {
  @ApiProperty({ example: 'Mar' })
  month: string;

  @ApiProperty({ example: 15000 })
  revenue: number;
}

export class BranchRevenueDto {
  @ApiProperty({ example: 'MedPlus Main Branch' })
  name: string;

  @ApiProperty({ example: 15000 })
  revenue: number;
}

export class BranchInventoryDto {
  @ApiProperty({ example: 'MedPlus Main Branch' })
  name: string;

  @ApiProperty({ example: 8 })
  value: number;
}

export class LowStockMedDto {
  @ApiProperty({ example: 'Paracetamol 500mg Tablets' })
  name: string;

  @ApiProperty({ example: 3 })
  quantity: number;
}

export class AlertDto {
  @ApiProperty({ example: 'MedPlus Main Branch' })
  branch: string;

  @ApiProperty({ example: 'Low stock: 2 medications below threshold' })
  msg: string;

  @ApiProperty({ enum: ['warning', 'info'], example: 'warning' })
  level: 'warning' | 'info';

  @ApiProperty({ type: [LowStockMedDto], required: false })
  meds?: LowStockMedDto[];
}

export class PharmacyStatsResponseDto {
  @ApiProperty({ example: 2 })
  totalBranches: number;

  @ApiProperty({ example: 5 })
  totalEmployees: number;

  @ApiProperty({ example: 15000 })
  monthlyRevenue: number;

  @ApiProperty({ example: 75000 })
  totalRevenue: number;

  @ApiProperty({ type: [RevenuePointDto] })
  revenueOverTime: RevenuePointDto[];

  @ApiProperty({ type: [BranchRevenueDto] })
  revenueByBranch: BranchRevenueDto[];

  @ApiProperty({ type: [BranchInventoryDto] })
  inventoryDistribution: BranchInventoryDto[];

  @ApiProperty({ type: [AlertDto] })
  alerts: AlertDto[];
}
