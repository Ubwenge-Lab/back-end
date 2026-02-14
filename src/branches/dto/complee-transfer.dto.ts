import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CompleteTransferDto {
  @ApiProperty({
    required: false,
    description: 'Completion notes'
  })
  @IsString()
  @IsOptional()
  completionNotes?: string;
}
