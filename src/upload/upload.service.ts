// backend/src/upload/upload.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private s3: AWS.S3;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.s3 = new AWS.S3({
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      region: this.configService.get<string>('AWS_REGION'),
    });
  
    const bucket = this.configService.get<string>('AWS_S3_BUCKET');
    if (!bucket) {
      throw new Error('AWS_S3_BUCKET is not defined in environment variables');
    }
    this.bucketName = bucket;
  }
  
  // ========================================
  // UPLOAD FILE TO S3
  // ========================================

  async uploadFile(
    file: Express.Multer.File,
    folder: 'prescriptions' | 'licenses' | 'certificates' | 'medications',
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, and PDF are allowed.',
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

    const params: AWS.S3.PutObjectRequest = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read', // Make file publicly accessible
    };

    try {
      const result = await this.s3.upload(params).promise();
      return result.Location; // Return S3 URL
    } catch (error) {
      throw new BadRequestException(`File upload failed: ${error.message}`);
    }
  }

  // ========================================
  // UPLOAD PRESCRIPTION
  // ========================================

  async uploadPrescription(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, 'prescriptions');
  }

  // ========================================
  // UPLOAD LICENSE
  // ========================================

  async uploadLicense(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, 'licenses');
  }

  // ========================================
  // UPLOAD MEDICATION IMAGE
  // ========================================

  async uploadMedicationImage(file: Express.Multer.File): Promise<string> {
    return this.uploadFile(file, 'medications');
  }

  // ========================================
  // DELETE FILE FROM S3
  // ========================================

  async deleteFile(fileUrl: string): Promise<void> {
    // Extract key from URL
    const key = fileUrl.split('.com/')[1];

    const params: AWS.S3.DeleteObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3.deleteObject(params).promise();
    } catch (error) {
      throw new BadRequestException(`File deletion failed: ${error.message}`);
    }
  }
}
