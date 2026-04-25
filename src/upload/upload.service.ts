// backend/src/upload/upload.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export interface UploadResult {
  url: string; // data URI — store directly in DB
  fileName: string; // original file name
  fileType: string; // MIME type
  sizeKb: number; // file size in KB for logging
}

@Injectable()
export class UploadService {
  // ========================================
  // CORE: FILE → BASE64 DATA URI
  // ========================================

  private toDataUri(file: MulterFile): string {
    const base64 = file.buffer.toString('base64');
    return `data:${file.mimetype};base64,${base64}`;
  }

  // ========================================
  // SHARED VALIDATION
  // ========================================

  private validate(
    file: MulterFile,
    allowedTypes: string[],
    maxSizeMb: number,
  ): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: ${allowedTypes.join(', ')}`,
      );
    }
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds ${maxSizeMb}MB limit`,
      );
    }
  }

  // ========================================
  // UPLOAD LICENSE (branch / pharmacy)
  // PDF + images, up to 10MB
  // ========================================

  async uploadLicense(file: MulterFile): Promise<UploadResult> {
    this.validate(
      file,
      ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
      10,
    );
    return {
      url: this.toDataUri(file),
      fileName: file.originalname,
      fileType: file.mimetype,
      sizeKb: Math.round(file.size / 1024),
    };
  }

  // ========================================
  // UPLOAD PRESCRIPTION (patient checkout)
  // PDF + images, up to 10MB
  // ========================================

  async uploadPrescription(file: MulterFile): Promise<UploadResult> {
    this.validate(
      file,
      ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
      10,
    );
    return {
      url: this.toDataUri(file),
      fileName: file.originalname,
      fileType: file.mimetype,
      sizeKb: Math.round(file.size / 1024),
    };
  }

  // ========================================
  // UPLOAD MEDICATION IMAGE (inventory)
  // Images only, up to 5MB
  // ========================================

  async uploadMedicationImage(file: MulterFile): Promise<UploadResult> {
    this.validate(
      file,
      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      5,
    );
    return {
      url: this.toDataUri(file),
      fileName: file.originalname,
      fileType: file.mimetype,
      sizeKb: Math.round(file.size / 1024),
    };
  }

  async deleteFile(_fileUrl: string): Promise<void> {
    return;
  }
}
