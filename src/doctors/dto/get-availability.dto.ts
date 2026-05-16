import { IsDateString, IsNotEmpty } from 'class-validator';

export class GetAvailabilityDto {
  @IsNotEmpty()
  @IsDateString({}, { message: 'Date must be in YYYY-MM-DD format' })
  date: string;
}