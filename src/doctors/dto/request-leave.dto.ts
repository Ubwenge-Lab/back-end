import { IsDateString, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestLeaveDto {
  @ApiProperty({
    example: '2026-07-10',
    description: 'Leave start date (inclusive)',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    example: '2026-07-15',
    description: 'Leave end date (inclusive)',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ example: 'Medical conference in Nairobi' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
