// backend/src/lab-results/dto/update-lab-order-status.dto.ts

import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DiagnosticStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS = [DiagnosticStatus.COLLECTED, DiagnosticStatus.IN_PROGRESS];

export class UpdateLabOrderStatusDto {
  @ApiProperty({
    enum: ALLOWED_TRANSITIONS,
    description: 'Next lifecycle status — COLLECTED (specimen taken) or IN_PROGRESS (being processed)',
  })
  @IsIn(ALLOWED_TRANSITIONS)
  status: DiagnosticStatus;
}
