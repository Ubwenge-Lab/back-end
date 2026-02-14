import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class TransferRequestItemDto {
  @ApiProperty({
    description: 'Chemical/generic name of medication (common across branches)',
    example: 'Paracetamol'
  })
  @IsString()
  chemicalName: string;

  @ApiProperty({
    description: 'Quantity needed',
    example: 100
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    required: false,
    description: 'Additional details (e.g., preferred strength, form)',
    example: '500mg tablets, Medic brand'
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
