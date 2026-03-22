import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransferStatus } from '@prisma/client';

export class UpdateStockTransferStatusDto {
  @ApiProperty({ enum: TransferStatus })
  @IsEnum(TransferStatus)
  @IsNotEmpty()
  status: TransferStatus;
}
