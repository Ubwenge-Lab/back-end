import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UploadBranchLicenseDto {
    @IsNotEmpty()
    @IsString()
    @IsUrl()
    pharmacyLicense: string;
}
