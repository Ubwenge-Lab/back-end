import { IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

export class ChangeBranchPasswordDto {
  @IsNotEmpty()
  @IsString()
  tempPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  newPassword: string;

  @IsNotEmpty()
  @IsString()
  confirmPassword: string;
}
