import { IsNotEmpty, IsString } from 'class-validator';

export class UploadBranchLicenseDto {
    @IsNotEmpty()
    @IsString()
    pharmacyLicense: string;
}
