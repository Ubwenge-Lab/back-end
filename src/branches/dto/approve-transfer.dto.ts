import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class ApproveTransferDto {
  @ApiProperty({
    required: false,
    description: 'Optional approval notes from HQ'
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
