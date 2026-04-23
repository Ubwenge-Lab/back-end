import { IsString, IsOptional, IsNumberString } from 'class-validator';

export class MtnCallbackDto {
  @IsString()
  financialTransactionId: string;

  @IsString()
  externalId: string; // This is Order ID

  @IsNumberString()
  amount: string;

  @IsString()
  currency: string;

  @IsString()
  status: 'SUCCESSFUL' | 'FAILED' | 'REJECTED' | 'TIMEOUT';

  @IsOptional()
  @IsString()
  reason?: string;
}