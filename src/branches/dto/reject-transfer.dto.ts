import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class RejectTransferDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  rejectionReason: string;
}
