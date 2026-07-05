// backend/src/upload/upload.controller.ts

import {
  Controller,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('prescription')
  @ApiOperation({ summary: 'Upload prescription — stored as base64 in DB' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPrescription(@UploadedFile() file: MulterFile) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.uploadPrescription(file);
  }

  // POST /upload/license
  @Post('license')
  @ApiOperation({
    summary: 'Upload pharmacy/branch license — stored as base64 in DB',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLicense(@UploadedFile() file: MulterFile) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.uploadLicense(file);
    // Returns { url, fileName, fileType, sizeKb }
    // Frontend: send url to PUT /auth/branch/upload-license as { pharmacyLicense: url }
  }

  // POST /upload/medication-image
  @Post('medication-image')
  @ApiOperation({ summary: 'Upload medication image — stored as base64 in DB' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedicationImage(@UploadedFile() file: MulterFile) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.uploadMedicationImage(file);
    // Returns { url, fileName, fileType, sizeKb }
    // Frontend: use url as imageUrl when creating/updating medication
  }

  // POST /upload/diagnostic-result
  @Post('diagnostic-result')
  @Roles(Role.TECHNICIAN, Role.NURSE, Role.DOCTOR, Role.HOSPITAL_ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Upload laboratory or radiology diagnostic result (PDF, DICOM, images) up to 20MB',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDiagnosticResult(@UploadedFile() file: MulterFile) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.uploadDiagnosticResult(file);
  }

  // DELETE /upload/file
  @Delete('file')
  @ApiOperation({
    summary: 'Delete file (no-op for DB storage — clear the DB field instead)',
  })
  async deleteFile(@Body('fileUrl') fileUrl: string) {
    await this.uploadService.deleteFile(fileUrl);
    return { message: 'File reference removed' };
  }
}
