import { ApiProperty } from "@nestjs/swagger";
import {TransferRequestItemDto } from "./transfer-item.dto";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CreateStockTransferDto {
  @ApiProperty({
    description: 'Branch that has the medication (from dropdown)',
  })
  @IsString()
  fromBranchId: string;

  @ApiProperty({
    type: [TransferRequestItemDto],
    description: 'Medications to request'
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferRequestItemDto)
  items: TransferRequestItemDto[];

  @ApiProperty({
    required: false,
    description: 'Additional context',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
