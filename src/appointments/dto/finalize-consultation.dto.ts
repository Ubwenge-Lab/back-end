import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class FinalizeConsultationDto {
  @IsString()
  @IsNotEmpty()
  diagnosisSummary: string;

  @IsString()
  @IsOptional()
  doctorRecommendations?: string;
}
