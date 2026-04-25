import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectBranchDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
