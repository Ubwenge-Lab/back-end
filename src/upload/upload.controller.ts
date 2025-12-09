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
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('prescription')
  @ApiOperation({ summary: 'Upload prescription file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPrescription(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const url = await this.uploadService.uploadPrescription(file);
    return {
      url,
      fileName: file.originalname,
      fileType: file.mimetype,
    };
  }

  @Post('license')
  @ApiOperation({ summary: 'Upload pharmacy license' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLicense(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const url = await this.uploadService.uploadLicense(file);
    return {
      url,
      fileName: file.originalname,
      fileType: file.mimetype,
    };
  }

  @Post('medication-image')
  @ApiOperation({ summary: 'Upload medication image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedicationImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const url = await this.uploadService.uploadMedicationImage(file);
    return {
      url,
      fileName: file.originalname,
      fileType: file.mimetype,
    };
  }

  @Delete('file')
  @ApiOperation({ summary: 'Delete file from S3' })
  async deleteFile(@Body('fileUrl') fileUrl: string) {
    await this.uploadService.deleteFile(fileUrl);
    return { message: 'File deleted successfully' };
  }
}