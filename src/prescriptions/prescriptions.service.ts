// backend/src/prescriptions/prescriptions.service.ts
// GEMINI AI VERSION - Free prescription reading

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicationsService } from '../medications/medications.service';
import { HospitalsService } from '../hospitals/hospitals.service';
import { CreatePrescriptionDto, UpdatePrescriptionStatusDto } from './dto';
import { HospitalIssuePrescriptionDto } from './dto/hospital-issue-prescription.dto';
import { StaffService } from '../staff/staff.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrescriptionMedication, PrescriptionStatus, DispenseStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { TriangulationService } from '../triangulation/triangulation.service';
import { ExternalFulfillmentWebhookDto, FulfillmentStatus } from './dto/external-fulfillment-webhook.dto';
import { Prisma } from '@prisma/client';

interface ExtractedMedication {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  matchedMedicationId?: string;
  matchedPharmacyId?: string;
  available?: boolean;
}

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private prisma: PrismaService,
    private patientsService: PatientsService,
    private notificationsService: NotificationsService,
    private medicationsService: MedicationsService,
    private configService: ConfigService,
    private staffService: StaffService,
    private hospitalsService: HospitalsService,
    private triangulationService: TriangulationService,

  ) {
    // Initialize Google Gemini AI
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      console.log('✅ Gemini AI initialized for prescription reading');
    } else {
      console.warn(
        '⚠️  GEMINI_API_KEY not set - AI prescription reading disabled',
      );
    }
  }

  // ========================================
  // CREATE PRESCRIPTION WITH AI READING
  // ========================================

  async create(userId: string, dto: CreatePrescriptionDto) {
    const patient = await this.patientsService.findByUserId(userId);

    // Create prescription record
    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: patient.id,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileType: dto.fileType,
        status: 'PENDING',
      },
    });

    // Process prescription with AI (async - don't block response)
    if (this.genAI) {
      this.processPrescriptionWithAI(prescription.id, dto.fileUrl).catch(
        (error) => {
          console.error('AI processing failed:', error);
        },
      );
    }

    return {
      prescription,
      message: this.genAI
        ? 'Prescription uploaded successfully. AI is processing your prescription...'
        : 'Prescription uploaded successfully.',
    };
  }

  // ========================================
  // AI PRESCRIPTION PROCESSING
  // ========================================

  private async processPrescriptionWithAI(
    prescriptionId: string,
    fileUrl: string,
  ) {
    if (!this.genAI) {
      return;
    }

    try {
      // Update status to processing
      await this.prisma.prescription.update({
        where: { id: prescriptionId },
        data: { aiProcessingStatus: 'PROCESSING' },
      });

      // Extract medications from prescription image
      const extractedMeds =
        await this.extractMedicationsFromPrescription(fileUrl);

      if (extractedMeds.length === 0) {
        await this.prisma.prescription.update({
          where: { id: prescriptionId },
          data: {
            aiProcessingStatus: 'FAILED',
            aiProcessingError: 'No medications found in prescription',
          },
        });
        return;
      }

      // Match medications with available pharmacy inventory
      const matchedMeds =
        await this.matchMedicationsWithInventory(extractedMeds);

      // Store extracted medications in database
      await this.storePrescriptionMedications(prescriptionId, matchedMeds);

      // Update prescription status
      await this.prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          aiProcessingStatus: 'COMPLETED',
          extractedMedications: JSON.parse(JSON.stringify(matchedMeds)),
        },
      });

      // Notify patient that prescription is ready
      const prescription = await this.findById(prescriptionId);
      const availableCount = matchedMeds.filter((m) => m.available).length;
      const totalCount = matchedMeds.length;

      await this.notificationsService.create({
        patientId: prescription.patientId,
        type: 'PRESCRIPTION_APPROVED',
        title: 'Prescription Processed',
        message:
          availableCount === totalCount
            ? `All ${totalCount} medications are available! Ready to add to cart.`
            : `Found ${availableCount} of ${totalCount} medications available. Ready to add to cart!`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('AI processing error:', error);
      await this.prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          aiProcessingStatus: 'FAILED',
          aiProcessingError: message,
        },
      });
    }
  }

  // ========================================
  // EXTRACT MEDICATIONS USING GEMINI AI
  // ========================================

  private async extractMedicationsFromPrescription(
    fileUrl: string,
  ): Promise<ExtractedMedication[]> {
    try {
      // Download image as base64
      const imageBase64 = await this.downloadImageAsBase64(fileUrl);

      // Use Gemini Flash model (free and fast)
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1, // Low temperature for accuracy
          maxOutputTokens: 2048,
        },
      });

      const result = await model.generateContent([
        {
          inlineData: {
            data: imageBase64,
            mimeType: this.getMediaType(fileUrl),
          },
        },
        `Analyze this medical prescription image and extract ALL medications listed.

For each medication, extract:
- Medication name (generic or brand name)
- Dosage (e.g., "500mg", "10ml")
- Frequency (e.g., "twice daily", "every 8 hours")
- Duration (e.g., "7 days", "2 weeks")
- Quantity prescribed (number of tablets/bottles)

Return ONLY a JSON array with this exact structure:
[
  {
    "name": "medication name",
    "dosage": "dosage amount",
    "frequency": "how often",
    "duration": "treatment period",
    "quantity": number
  }
]

If you cannot read the prescription clearly, return an empty array [].
Do not include any explanation, only the JSON array.`,
      ]);

      // Parse Gemini's response
      const responseText = result.response.text();
      console.log('Gemini response:', responseText);

      // Extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        console.error('No valid JSON found in Gemini response');
        return [];
      }

      const medications: ExtractedMedication[] = JSON.parse(jsonMatch[0]);
      console.log(
        `Extracted ${medications.length} medications from prescription`,
      );

      return medications;
    } catch (error: unknown) {
      console.error('Gemini AI extraction error:', error);
      throw new Error('Failed to extract medications from prescription');
    }
  }

  // ========================================
  // MATCH MEDICATIONS WITH PHARMACY INVENTORY
  // ========================================

  private async matchMedicationsWithInventory(
    extractedMeds: ExtractedMedication[],
  ): Promise<ExtractedMedication[]> {
    const matchedMeds: ExtractedMedication[] = [];

    for (const med of extractedMeds) {
      // Search for medication in all approved pharmacies
      const searchResult = await this.medicationsService.search({
        query: med.name,
        limit: 1,
      });

      if (searchResult.length > 0) {
        const foundMed = searchResult[0];
        matchedMeds.push({
          ...med,
          matchedMedicationId: foundMed.id,
          matchedPharmacyId: foundMed.pharmacyId,
          available: foundMed.quantity > 0,
        });
      } else {
        matchedMeds.push({
          ...med,
          available: false,
        });
      }
    }

    return matchedMeds;
  }

  // ========================================
  // STORE PRESCRIPTION MEDICATIONS
  // ========================================

  private async storePrescriptionMedications(
    prescriptionId: string,
    medications: ExtractedMedication[],
  ) {
    for (const med of medications) {
      await this.prisma.prescriptionMedication.create({
        data: {
          prescriptionId,
          medicationName: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          duration: med.duration,
          quantity: med.quantity || 1,
          matchedMedicationId: med.matchedMedicationId,
          available: med.available || false,
        },
      });
    }
  }

  // ========================================
  // GET PRESCRIPTION MEDICATIONS
  // ========================================

  async getPrescriptionMedications(prescriptionId: string) {
    return this.prisma.prescriptionMedication.findMany({
      where: { prescriptionId },
      include: {
        matchedMedication: {
          include: {
            pharmacy: true,
          },
        },
      },
    });
  }

  // ========================================
  // ADD PRESCRIPTION MEDICATIONS TO CART
  // ========================================

  async addPrescriptionToCart(userId: string, prescriptionId: string) {
    const patient = await this.patientsService.findByUserId(userId);
    const prescription = await this.findById(prescriptionId);

    // Verify prescription belongs to patient
    if (prescription.patientId !== patient.id) {
      throw new ForbiddenException('This prescription does not belong to you');
    }

    // Get all available medications from prescription
    const prescriptionMeds =
      await this.getPrescriptionMedications(prescriptionId);
    const availableMeds = prescriptionMeds.filter(
      (m) => m.available && m.matchedMedicationId,
    );

    if (availableMeds.length === 0) {
      throw new BadRequestException(
        'No available medications found in this prescription',
      );
    }

    // Group medications by pharmacy
    const medsByPharmacy = new Map<string, any[]>();
    for (const med of availableMeds) {
      const pharmacyId = med.matchedMedication.pharmacyId;
      if (!medsByPharmacy.has(pharmacyId)) {
        medsByPharmacy.set(pharmacyId, []);
      }
      medsByPharmacy.get(pharmacyId).push(med);
    }

    // Add to cart for each pharmacy
    const cartItems = [];
    for (const [pharmacyId, meds] of medsByPharmacy.entries()) {
      for (const med of meds) {
        // Check if item already in cart, if so update quantity
        const existingCartItem = await this.prisma.cartItem.findUnique({
          where: {
            patientId_medicationId: {
              patientId: patient.id,
              medicationId: med.matchedMedicationId,
            },
          },
        });

        if (existingCartItem) {
          const updatedItem = await this.prisma.cartItem.update({
            where: { id: existingCartItem.id },
            data: {
              quantity: existingCartItem.quantity + (med.quantity || 1),
            },
            include: {
              medication: true,
              pharmacy: true,
            },
          });
          cartItems.push(updatedItem);
        } else {
          const cartItem = await this.prisma.cartItem.create({
            data: {
              patientId: patient.id,
              pharmacyId,
              medicationId: med.matchedMedicationId,
              quantity: med.quantity || 1,
              prescriptionId,
            },
            include: {
              medication: true,
              pharmacy: true,
            },
          });
          cartItems.push(cartItem);
        }
      }
    }

    return {
      message: `Added ${cartItems.length} medications to cart from ${medsByPharmacy.size} pharmacy(ies)`,
      cartItems,
      unavailableMedications: prescriptionMeds.filter((m) => !m.available),
    };
  }

  // ========================================
  // EXISTING METHODS
  // ========================================

  async findById(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    return prescription;
  }

  async findByPatient(userId: string) {
    const patient = await this.patientsService.findByUserId(userId);

    return this.prisma.prescription.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { prescriptionMedications: true },
        },
      },
    });
  }

  async findByBranch(userId: string, statusStr?: string) {
    let branchId: string;

    try {
      const staff = await this.staffService.findByUserId(userId);
      branchId = staff.branch.id;
    } catch (e) {
      throw new ForbiddenException(
        'Only pharmacy staff can view branch prescriptions',
      );
    }

    const where: any = {
      prescriptionMedications: {
        some: {
          matchedMedication: {
            branchId: branchId,
          },
        },
      },
    };

    if (statusStr) {
      where.status = statusStr;
    }

    return this.prisma.prescription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: { firstName: true, lastName: true, phone: true },
        },
        prescriptionMedications: {
          where: {
            matchedMedication: {
              branchId: branchId,
            },
          },
          include: {
            matchedMedication: {
              select: {
                name: true,
                price: true,
                quantity: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async updateStatus(id: string, dto: UpdatePrescriptionStatusDto) {
    const prescription = await this.findById(id);

    const updated = await this.prisma.prescription.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.rejectionReason,
        reviewedAt: new Date(),
      },
    });

    if (dto.status === 'REJECTED') {
      await this.notificationsService.create({
        patientId: prescription.patientId,
        type: 'PRESCRIPTION_REJECTED',
        title: 'Prescription Rejected',
        message:
          dto.rejectionReason ||
          'Your prescription was rejected by the pharmacy.',
      });
    }

    if (dto.status === 'APPROVED') {
      try {
        await this.notificationsService.create({
          userId: prescription.patient.userId,
          type: 'PRESCRIPTION_DISPATCHED',
          title: 'Prescription Ready',
          message: 'Your prescription has been approved and is ready.',
        });
      } catch (error) {
        console.error(
          'Failed to send PRESCRIPTION_DISPATCHED notification:',
          error,
        );
      }
    }

    return updated;
  }

  // ========================================
  // EXTERNAL FULFILLMENT WEBHOOK CALLBACK
  // ========================================

  async processExternalFulfillment(dto: ExternalFulfillmentWebhookDto) {
    const { prescriptionId, pharmacyId, prescriptionMedicationIds, status, notes } = dto;

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Fetch prescription
        const prescription = await tx.prescription.findUnique({
          where: { id: prescriptionId },
          include: {
            prescriptionMedications: true,
            patient: { select: { userId: true } },
          },
        });

        if (!prescription) {
          throw new NotFoundException(`Prescription ${prescriptionId} not found`);
        }

        // 2. Fetch target medication items
        const targetItems = prescription.prescriptionMedications.filter((item) =>
          prescriptionMedicationIds.includes(item.id),
        );

        if (targetItems.length === 0) {
          throw new BadRequestException(
            'None of the provided medication IDs match this prescription',
          );
        }

        // Validate pharmacy assignment
        for (const item of targetItems) {
          if (item.pharmacyId && item.pharmacyId !== pharmacyId) {
            throw new ForbiddenException(
              `Medication item ${item.id} is assigned to a different pharmacy`,
            );
          }
        }

        // 3. Update dispense status for target items
        const newDispenseStatus: DispenseStatus =
        status === FulfillmentStatus.FULFILLED
          ? DispenseStatus.FULFILLED
          : status === FulfillmentStatus.PARTIALLY_FULFILLED
          ? DispenseStatus.DISPATCHED_TO_PHARMACY
          : DispenseStatus.PENDING;

        const now = new Date();

        await tx.prescriptionMedication.updateMany({
        where: { id: { in: prescriptionMedicationIds } },
        data: {
          dispenseStatus: newDispenseStatus,
          fulfilledAt: status === FulfillmentStatus.FULFILLED ? now : undefined,
          available: status === FulfillmentStatus.FULFILLED,
        },
      });

        const alreadyFulfilled = targetItems.filter(
          (item) => item.dispenseStatus === 'FULFILLED',
        );

        if (alreadyFulfilled.length === targetItems.length) {
          return {
            message: 'Items have already been fulfilled (idempotent response)',
            prescriptionId,
            itemsUpdated: 0,
            isFullyFulfilled: prescription.status === 'APPROVED',
            status: prescription.status,
          };
        }

        // 4. Re-fetch all prescription medications to calculate complete state
        const allItems = await tx.prescriptionMedication.findMany({
          where: { prescriptionId },
        });

        const isFullyFulfilled = allItems.every(
          (item) =>
            item.dispenseStatus === DispenseStatus.HOSPITAL_DISPENSED ||
            item.dispenseStatus === DispenseStatus.FULFILLED,
        );

        let updatedPrescription = prescription;

        if (isFullyFulfilled && prescription.refillsRemaining > 0) {
          updatedPrescription = await tx.prescription.update({
            where: { id: prescriptionId },
            data: {
              status: 'APPROVED',
              refillsRemaining: { decrement: 1 },
            },
            include: {
              prescriptionMedications: true,
              patient: { select: { userId: true } },
            },
          });
        }

        // 5. Notify patient
        try {
          await this.notificationsService.create({
            userId: prescription.patient.userId,
            type: 'PRESCRIPTION_APPROVED',
            title: 'Prescription Order Fulfilled',
            message:
              status === FulfillmentStatus.FULFILLED
                ? `Your medication order for prescription ${prescriptionId} has been fulfilled by the partner pharmacy.`
                : `Update on prescription ${prescriptionId}: Fulfillment status is ${status}.`,
          });
        } catch (error) {
          console.error('Failed to send fulfillment notification:', error);
        }

        return {
          message: 'Fulfillment callback processed successfully',
          prescriptionId,
          itemsUpdated: targetItems.length,
          isFullyFulfilled,
          status: updatedPrescription.status,
        };
      },
      { timeout: 20000 },
    );
  }



  // ========================================
  // HELPER: DOWNLOAD IMAGE AS BASE64
  // Works with both legacy HTTP URLs (S3) and new data URIs (DB storage)
  // ========================================

  private async downloadImageAsBase64(fileUrl: string): Promise<string> {
    // Data URI format: "data:<mime>;base64,<data>"
    if (fileUrl.startsWith('data:')) {
      const commaIdx = fileUrl.indexOf(',');
      if (commaIdx === -1) throw new Error('Invalid data URI format');
      return fileUrl.slice(commaIdx + 1); // already base64
    }

    // Legacy: HTTP/HTTPS URL (S3 or other)
    try {
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data).toString('base64');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download image: ${message}`);
    }
  }

  private getMediaType(fileUrl: string): string {
    // Data URI carries MIME type directly: "data:image/png;base64,..."
    if (fileUrl.startsWith('data:')) {
      const mime = fileUrl.split(';')[0].replace('data:', '');
      return mime || 'image/jpeg';
    }

    // Legacy: infer from file extension
    const extension = fileUrl.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
      default:
        return 'image/jpeg';
    }
  }
  // 1. Serialization and cryptographic HMAC-SHA256 signature generator
  generatePrescriptionHash(
    doctorLicense: string,
    patientId: string,
    medications: any[],
    date: Date,
  ): string {
    // Sort medications deterministically to avoid array order mismatches
    const canonicalMeds = medications
      .map((med) => {
        const name = (med.name || '').toLowerCase().trim();
        const dosage = (med.dosage || '').toLowerCase().trim();
        const qty = med.quantity ?? 1;
        return `${name}:${dosage}:${qty}`;
      })
      .sort()
      .join(',');

    // Canonical representation
    const serialized = [
      doctorLicense.toLowerCase().trim(),
      patientId.toLowerCase().trim(),
      canonicalMeds,
      date.toISOString(),
    ].join('|');

    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      'default-prescription-secret-key-2026';
    return crypto.createHmac('sha256', secret).update(serialized).digest('hex');
  }

  // 2. Base64 QR Code Generator
  async generateQrCode(prescriptionId: string, hash: string): Promise<string> {
    const payload = JSON.stringify({
      id: prescriptionId,
      hash: hash,
    });
    return QRCode.toDataURL(payload);
  }

  // 3. Verification & Refill Decrement Logic
  async verifyPrescription(payload: { id?: string; qrCodePayload?: string }) {
    let prescriptionId = payload.id;
    let qrHash: string | undefined;

    if (!prescriptionId && !payload.qrCodePayload) {
      throw new BadRequestException(
        'Either prescription id or scanned QR code payload must be provided',
      );
    }

    // If scanned QR payload is passed, parse the JSON
    if (payload.qrCodePayload) {
      try {
        const parsed = JSON.parse(payload.qrCodePayload);
        if (parsed.id) {
          prescriptionId = parsed.id;
          qrHash = parsed.hash;
        }
      } catch (e) {
        throw new BadRequestException('Invalid QR code payload format');
      }
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        doctor: true,
        patient: { select: { userId: true, firstName: true, lastName: true } },
        prescriptionMedications: true,
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    // Retrieve active medications list in original format
    const medications = prescription.prescriptionMedications.map((m) => ({
      name: m.medicationName,
      dosage: m.dosage,
      quantity: m.quantity,
    }));

    const doctorLicense = prescription.doctor?.licenseNumber || '';

    // Recalculate signature to check for tampering
    const computedHash = this.generatePrescriptionHash(
      doctorLicense,
      prescription.patientId,
      medications,
      prescription.createdAt,
    );

    const storedHash = prescription.verificationHash;
    const isTampered =
      computedHash !== storedHash || (qrHash && qrHash !== storedHash);

    const details = {
      id: prescription.id,
      patientId: prescription.patientId,
      patientName: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
      doctorId: prescription.doctorId,
      doctorLicense: doctorLicense,
      medications,
      refillsAllowed: prescription.refillsAllowed,
      refillsRemaining: prescription.refillsRemaining,
      createdAt: prescription.createdAt,
    };

    // A. TAMPERED CHECK
    if (isTampered) {
      return {
        status: 'TAMPERED',
        prescriptionDetails: details,
      };
    }

    // B. EXPIRED CHECK (30 Days Validity)
    const daysDifference =
      (new Date().getTime() - prescription.createdAt.getTime()) /
      (1000 * 3600 * 24);
    if (daysDifference > 30) {
      return {
        status: 'EXPIRED',
        prescriptionDetails: details,
      };
    }

    // C. FILLED CHECK (0 Refills Remaining)
    if (prescription.refillsRemaining <= 0) {
      return {
        status: 'FILLED',
        prescriptionDetails: details,
      };
    }

    // D. VALID: Decrement refillsRemaining by 1
    const updated = await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        refillsRemaining: {
          decrement: 1,
        },
      },
    });

    return {
      status: 'VALID',
      prescriptionDetails: {
        ...details,
        refillsRemaining: updated.refillsRemaining,
      },
    };
  }

  // ========================================
  // HOSPITAL PRESCRIPTION ISSUE — STOCK CHECK + PHARMACY FALLBACK
  // ========================================

  async emitHospitalDigitalPrescription(
    doctorUserId: string,
    dto: HospitalIssuePrescriptionDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // Resolve doctor
        const doctor = await tx.doctor.findUnique({
          where: { userId: doctorUserId },
        });
        if (!doctor) {
          throw new ForbiddenException(
            'Profile validation failed: active doctor account not found',
          );
        }

        // Validate appointment
        const appointment = await tx.appointment.findUnique({
          where: { id: dto.appointmentId },
        });
        if (!appointment) {
          throw new NotFoundException('Target encounter record not found');
        }

        // Load hospital for coordinates (needed for pharmacy fallback)
        const hospital = await tx.hospital.findUnique({
          where: { id: dto.hospitalId },
        });
        if (!hospital) {
          throw new NotFoundException('Hospital not found');
        }

        // Format the custom prescription ID: EVUZE-PRESC-[YEAR]-[6-DIGIT-RANDOM]
        const year = new Date().getFullYear();
        let prescriptionId = '';
        let exists = true;
        while (exists) {
          const random6 = Math.floor(100000 + Math.random() * 900000);
          prescriptionId = `EVUZE-PRESC-${year}-${random6}`;
          const found = await tx.prescription.findUnique({
            where: { id: prescriptionId },
          });
          if (!found) exists = false;
        }

        const date = new Date();
        const verificationHash = this.generatePrescriptionHash(
          doctor.licenseNumber,
          dto.patientId,
          dto.medications,
          date,
        );

        const qrCodeUrl = await this.generateQrCode(
          prescriptionId,
          verificationHash,
        );

        // Create parent prescription with security fields
        const prescription = await tx.prescription.create({
          data: {
            id: prescriptionId,
            patientId: dto.patientId,
            doctorId: doctor.id,
            hospitalId: dto.hospitalId,
            appointmentId: dto.appointmentId,
            diagnosis: appointment.diagnosisSummary || 'Clinical Consultation',
            status: 'APPROVED',
            verificationHash,
            qrCodeUrl,
            refillsAllowed: dto.refillsAllowed ?? 1,
            refillsRemaining: dto.refillsAllowed ?? 1,
            createdAt: date,
          },
        });

        // Find or get encounter invoice for auto-population
        let invoice = await tx.hospitalInvoice.findUnique({
          where: { appointmentId: dto.appointmentId },
        });
        if (!invoice) {
          invoice = await tx.hospitalInvoice.create({
            data: {
              appointmentId: dto.appointmentId,
              patientId: dto.patientId,
              hospitalId: dto.hospitalId,
              totalAmount: 0,
            },
          });
        }

        const prescriptionMeds: PrescriptionMedication[] = [];
        let invoiceAddedTotal = 0;

        for (const med of dto.medications) {
          // Try to find the drug in hospital stock by name match
          const stockItems = await tx.hospitalDrugStock.findMany({
            where: { hospitalId: dto.hospitalId },
            include: { drug: true },
          });

          const matchedStock = stockItems.find(
            (s) =>
              s.drug.brandName.toLowerCase().includes(med.name.toLowerCase()) ||
              s.drug.genericName.toLowerCase().includes(med.name.toLowerCase()),
          );

          const qty = med.quantity ?? 1;

          if (matchedStock && matchedStock.quantity >= qty) {
            // PATH A: Hospital stock available — dispense internally
            await tx.hospitalDrugStock.update({
              where: {
                drugId_hospitalId: {
                  drugId: matchedStock.drugId,
                  hospitalId: dto.hospitalId,
                },
                quantity: { gte: qty }, // Atomic guard
              },
              data: { quantity: { decrement: qty } },
            });

            const pmRow = await tx.prescriptionMedication.create({
              data: {
                prescriptionId: prescription.id,
                medicationName: med.name,
                dosage: med.dosage,
                frequency: med.frequency,
                duration: med.duration,
                quantity: qty,
                isHospitalMed: true,
                hospitalDrugStockDrugId: matchedStock.drugId,
                hospitalDrugStockHospitalId: matchedStock.hospitalId,
                fulfilledAt: new Date(),
                dispenseStatus: 'HOSPITAL_DISPENSED',
                available: true,
              },
            });
            prescriptionMeds.push(pmRow);

            // Auto-add to invoice
            const unitPrice = Number(matchedStock.unitPrice);
            const subtotal = unitPrice * qty;
            await tx.hospitalInvoiceItem.create({
              data: {
                invoiceId: invoice.id,
                description: `${med.name} (hospital dispensed)`,
                quantity: qty,
                unitCost: unitPrice,
                subtotal,
                category: 'HOSPITAL_DRUG',
              },
            });
            invoiceAddedTotal += subtotal;
          } else {
            // PATH B: Hospital stock unavailable — route to 10 km triangulated pharmacy
            let assignedPharmacyId: string | null = null;
            let matchedMedId: string | null = null;

            if (hospital.latitude && hospital.longitude) {
              const fallbackPharmacy = await this.findNearestPharmacyWithStockWithinRadius(
                hospital.latitude,
                hospital.longitude,
                med.name,
                qty,
                10, // 10 km radius limit
              );

              if (fallbackPharmacy) {
                assignedPharmacyId = fallbackPharmacy.pharmacyId;
                matchedMedId = fallbackPharmacy.matchedMedicationId || null;
              }
            }

            const pmRow = await tx.prescriptionMedication.create({
              data: {
                prescriptionId: prescription.id,
                medicationName: med.name,
                dosage: med.dosage,
                frequency: med.frequency,
                duration: med.duration,
                quantity: qty,
                isHospitalMed: false,
                pharmacyId: assignedPharmacyId,
                matchedMedicationId: matchedMedId,
                dispenseStatus: 'PENDING',
                available: !!matchedMedId,
              },
            });
            prescriptionMeds.push(pmRow);

            if (assignedPharmacyId) {
              await tx.hospitalInvoiceItem.create({
                data: {
                  invoiceId: invoice.id,
                  description: `${med.name} (dispatched to 10km external pharmacy)`,
                  quantity: qty,
                  unitCost: 0,
                  subtotal: 0,
                  category: 'PHARMACY_DRUG',
                  pharmacyId: assignedPharmacyId,
                },
              });
            }

            if (!assignedPharmacyId) {
              // Flag on summary response or log warning
              this.logger.warn(
                `No partner pharmacy within 10km found for medication ${med.name} (Prescription: ${prescription.id})`,
              );
            }
          }
        }

        // Update invoice total
        if (invoiceAddedTotal > 0) {
          await tx.hospitalInvoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: {
                increment: invoiceAddedTotal,
              },
            },
          });
        }

        return {
          prescription: {
            ...prescription,
            prescriptionMedications: prescriptionMeds,
          },
          summary: {
            totalDrugs: dto.medications.length,
            hospitalDispensed: prescriptionMeds.filter((m) => m.isHospitalMed)
              .length,
            routedToPharmacy: prescriptionMeds.filter((m) => !m.isHospitalMed)
              .length,
          },
        };
      },
      { timeout: 20000 },
    );
  }

  // ========================================
  // EXTERNAL PHARMACY DISPATCH
  // ========================================

async dispatchExternal(prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { prescriptionMedications: true },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.dispatchedAt) {
      throw new ConflictException(
        'This prescription has already been dispatched to external pharmacies',
      );
    }

    const externalItems = prescription.prescriptionMedications.filter(
      (m) => !m.isHospitalMed && m.dispenseStatus !== 'HOSPITAL_DISPENSED',
    );

    if (externalItems.length === 0) {
      throw new BadRequestException(
        'No items require external pharmacy dispatch',
      );
    }

    // Group items by target pharmacy
    const byPharmacy = new Map<string, typeof externalItems>();
    for (const item of externalItems) {
      if (!item.pharmacyId) {
        throw new BadRequestException(
          `Item "${item.medicationName}" does not have an assigned external pharmacy within range`,
        );
      }
      const pid = item.pharmacyId;
      if (!byPharmacy.has(pid)) byPharmacy.set(pid, []);
      byPharmacy.get(pid)!.push(item);
    }

    const createdOrders: any[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        for (const pharmacyId of byPharmacy.keys()) {
          const order = await tx.order.create({
            data: {
              patientId: prescription.patientId,
              pharmacyId,
              type: 'PICKUP',
              status: 'PENDING',
              total: 0,
            },
          });
          createdOrders.push(order);
        }

        for (const item of externalItems) {
          await tx.prescriptionMedication.update({
            where: { id: item.id },
            data: { 
              dispenseStatus: 'DISPATCHED_TO_PHARMACY',
            },
          });
        }

        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { 
            dispatchedAt: new Date(),
            status: 'PENDING',
          },
        });
      },
      { timeout: 20000 },
    );

    return {
      message: `Dispatched ${externalItems.length} item(s) to ${byPharmacy.size} pharmacy(ies)`,
      orders: createdOrders,
    };
  }

  // ========================================
  // PATIENT PRESCRIPTIONS BY MRN
  // ========================================

  async findByPatientMrn(mrn: string, hospitalId: string) {
    const registration =
      await this.prisma.hospitalPatientRegistration.findUnique({
        where: { hospitalId_mrn: { hospitalId, mrn } },
      });

    if (!registration) {
      throw new NotFoundException(
        `No patient found with MRN ${mrn} at this hospital`,
      );
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where: { patientId: registration.patientId, hospitalId },
      orderBy: { createdAt: 'desc' },
      include: {
        prescriptionMedications: {
          select: {
            id: true,
            medicationName: true,
            dosage: true,
            frequency: true,
            duration: true,
            quantity: true,
            isHospitalMed: true,
            pharmacyId: true,
            fulfilledAt: true,
            dispenseStatus: true,
          },
        },
        doctor: {
          select: { firstName: true, lastName: true, specialization: true },
        },
      },
    });

    return prescriptions;
  }


  /**
   * Helper: Searches external pharmacies within 10 km radius that have the medication in stock
   */
  async findNearestPharmacyWithStockWithinRadius(
    originLat: number,
    originLng: number,
    medicationName: string,
    requiredQty: number,
    radiusKm: number = 10,
  ): Promise<{ pharmacyId: string; branchId?: string; matchedMedicationId?: string } | null> {
    // 1. Fetch nearby pharmacies & branches within 10 km
    const nearbyLocations = await this.triangulationService.getNearbyPharmacies(
      originLat,
      originLng,
      radiusKm,
    );

    if (!nearbyLocations || nearbyLocations.length === 0) {
      return null;
    }

    // 2. Iterate through ordered nearest pharmacies to match stock in Medication table
    for (const location of nearbyLocations) {
      const availableMedication = await this.prisma.medication.findFirst({
        where: {
          pharmacyId: location.id,
          quantity: { gte: requiredQty },
          name: { contains: medicationName, mode: 'insensitive' },
        },
      });

      if (availableMedication) {
        return {
          pharmacyId: location.id,
          matchedMedicationId: availableMedication.id,
        };
      }
    }

    // 3. Fallback to nearest pharmacy even if stock isn't explicitly pre-indexed
    return {
      pharmacyId: nearbyLocations[0].id,
    };
  }


}
