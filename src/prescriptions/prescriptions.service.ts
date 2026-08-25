// backend/src/prescriptions/prescriptions.service.ts
// GEMINI AI VERSION - Free prescription reading

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicationsService } from '../medications/medications.service';
import { HospitalsService } from '../hospitals/hospitals.service';
import { CreatePrescriptionDto, UpdatePrescriptionStatusDto } from './dto';
import { HospitalIssuePrescriptionDto } from './dto/hospital-issue-prescription.dto';
import { StaffService } from '../staff/staff.service';
import { OrdersService } from '../orders/orders.service';
import { ConfirmTranscriptionDto } from './dto/confirm-transcription.dto';
import { StaffDirectUploadPrescriptionDto } from './dto/staff-direct-upload.dto';
import * as bcrypt from 'bcrypt';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrescriptionMedication } from '@prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

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
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private prisma: PrismaService,
    private patientsService: PatientsService,
    private notificationsService: NotificationsService,
    private medicationsService: MedicationsService,
    private configService: ConfigService,
    private staffService: StaffService,
    private hospitalsService: HospitalsService,
    private ordersService: OrdersService,
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
      // Fall back to branch-manager resolution
      const branchManager = await this.prisma.branch.findFirst({
        where: { managerId: userId },
        select: { id: true },
      });
      if (!branchManager) {
        throw new ForbiddenException(
          'Only pharmacy staff can view branch prescriptions',
        );
      }
      branchId = branchManager.id;
    }

    const where: any = {
      OR: [
        // Staff/counter uploads are tagged with branchId directly (walk-ins)
        { branchId },
        // Patient uploads are linked through AI-matched inventory
        {
          prescriptionMedications: {
            some: {
              matchedMedication: {
                branchId: branchId,
              },
            },
          },
        },
      ],
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
        patient: true,
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
            // PATH B: Out of stock — route to nearest E-Vuze pharmacy
            let assignedPharmacyId: string | null = null;
            if (hospital.latitude && hospital.longitude) {
              const nearest =
                await this.hospitalsService.findNearestPartnerPharmacy(
                  hospital.latitude,
                  hospital.longitude,
                );
              if (nearest) assignedPharmacyId = nearest.id;
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
                dispenseStatus: 'PENDING',
                available: false,
              },
            });
            prescriptionMeds.push(pmRow);

            // Add tracking line item to invoice
            if (assignedPharmacyId) {
              await tx.hospitalInvoiceItem.create({
                data: {
                  invoiceId: invoice.id,
                  description: `${med.name} (dispatched to pharmacy)`,
                  quantity: qty,
                  unitCost: 0,
                  subtotal: 0,
                  category: 'PHARMACY_DRUG',
                  pharmacyId: assignedPharmacyId,
                },
              });
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

    // 409 Conflict — prevent duplicate dispatch
    if (prescription.dispatchedAt) {
      throw new ConflictException(
        'This prescription has already been dispatched to external pharmacies',
      );
    }

    const externalItems = prescription.prescriptionMedications.filter(
      (m) => !m.isHospitalMed && m.pharmacyId,
    );

    if (externalItems.length === 0) {
      throw new BadRequestException(
        'No items require external pharmacy dispatch',
      );
    }

    // Group by pharmacy
    const byPharmacy = new Map<string, typeof externalItems>();
    for (const item of externalItems) {
      const pid = item.pharmacyId;
      if (!byPharmacy.has(pid)) byPharmacy.set(pid, []);
      byPharmacy.get(pid).push(item);
    }

    const createdOrders: any[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        for (const pharmacyId of byPharmacy.keys()) {
          const total = 0; // Price TBD by pharmacy
          const order = await tx.order.create({
            data: {
              patientId: prescription.patientId,
              pharmacyId,
              type: 'PICKUP',
              status: 'PENDING',
              total,
              prescriptionId: undefined, // Don't link — already linked via prescription model
            },
          });
          createdOrders.push(order);
        }

        // Mark each item as dispatched
        for (const item of externalItems) {
          await tx.prescriptionMedication.update({
            where: { id: item.id },
            data: { dispenseStatus: 'DISPATCHED_TO_PHARMACY' },
          });
        }

        // Mark prescription as dispatched
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { dispatchedAt: new Date() },
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

  // ════════════════════════════════════════════════════════════════
  // UGANDA-PORTED (verified in back-end_uganda): counter workflows
  // ════════════════════════════════════════════════════════════════

  async staffDirectUpload(
    staffUserId: string,
    dto: StaffDirectUploadPrescriptionDto,
  ) {
    // Resolve staff branch
    const staff = await this.staffService
      .findByUserId(staffUserId)
      .catch(() => null);
    const branchManager = await this.prisma.branch.findFirst({
      where: { managerId: staffUserId },
    });

    const branchId = staff?.branchId ?? branchManager?.id;
    if (!branchId) {
      throw new ForbiddenException('Staff member is not assigned to a branch');
    }

    // Get pharmacy from branch
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { pharmacyId: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    // If patientId provided, verify patient exists
    if (dto.patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: dto.patientId },
      });
      if (!patient) throw new NotFoundException('Patient not found');
    }

    // Walk-in: create (or reuse) a guest patient record
    const patientId =
      dto.patientId ??
      (await this.getOrCreateWalkInPatientId(branchId, {
        name: dto.patientName,
        phone: dto.patientPhone,
      }));

    // Create prescription record directly, tagged with the branch so the
    // pharmacist review queue can find it BEFORE the AI finishes matching.
    const prescription = await this.prisma.prescription.create({
      data: {
        patientId,
        branchId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileType: dto.fileType,
        notes: dto.notes,
        status: 'PENDING',
        aiProcessingStatus: 'PENDING',
      },
    });

    // Trigger AI processing if enabled (same path as patient upload)
    if (this.genAI) {
      this.processPrescriptionWithAI(prescription.id, dto.fileUrl).catch(
        (err) => {
          console.error(
            'AI processing failed for staff-uploaded prescription:',
            err,
          );
        },
      );
    }

    return {
      prescription,
      message: this.genAI
        ? 'Prescription uploaded by staff. AI is processing medications...'
        : 'Prescription uploaded by staff. Please verify manually.',
    };
  }

  // Helper: get or create a minimal guest "Walk-In Patient"
  private async getOrCreateWalkInPatientId(
    branchId: string,
    opts: { name?: string; phone?: string } = {},
  ): Promise<string> {
    const phone = opts.phone?.trim() || '0000000000';

    // Reuse an existing patient with the same phone (same person at the counter)
    const existing = await this.prisma.patient.findFirst({
      where: { phone },
      select: { id: true },
    });
    if (existing) return existing.id;

    // Create a minimal user + patient pair
    const randomPassword = crypto.randomBytes(12).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    const email = `walkin-${crypto.randomBytes(6).toString('hex')}@evuze.local`;

    const name = opts.name?.trim() || 'Walk-in';
    const [first, ...rest] = name.split(/\s+/);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'PATIENT',
        isVerified: false,
        firstName: first || 'Walk-in',
        lastName: rest.join(' ') || 'Patient',
      },
    });

    const patient = await this.prisma.patient.create({
      data: {
        userId: user.id,
        firstName: first || 'Walk-in',
        lastName: rest.join(' ') || 'Patient',
        phone,
      },
    });

    return patient.id;
  }

  // Pharmacist confirms/corrects the transcription and can convert the
  // prescription into a structured order (or hand items to the POS cart).
  async confirmTranscription(
    staffUserId: string,
    prescriptionId: string,
    dto: ConfirmTranscriptionDto,
  ) {
    // Resolve staff branch (staff record or branch manager)
    const staff = await this.staffService
      .findByUserId(staffUserId)
      .catch(() => null);
    const branchManager = await this.prisma.branch.findFirst({
      where: { managerId: staffUserId },
    });
    const branchId = staff?.branchId ?? branchManager?.id;
    if (!branchId) {
      throw new ForbiddenException('Staff member is not assigned to a branch');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { patient: { select: { id: true, userId: true } } },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');

    // The prescription must belong to this branch's queue
    const inBranch =
      prescription.branchId === branchId ||
      (await this.prisma.prescriptionMedication.findFirst({
        where: {
          prescriptionId,
          matchedMedication: { branchId },
        },
      }));
    if (!inBranch) {
      throw new ForbiddenException(
        'Prescription does not belong to this branch',
      );
    }

    // Persist the confirmed (corrected) transcription
    await this.prisma.$transaction([
      this.prisma.prescriptionMedication.deleteMany({
        where: { prescriptionId },
      }),
      this.prisma.prescriptionMedication.createMany({
        data: dto.items.map((item) => ({
          prescriptionId,
          medicationName: item.name,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          quantity: item.quantity,
          matchedMedicationId: item.medicationId,
          available: Boolean(item.medicationId),
        })),
      }),
    ]);

    const updated = await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        aiProcessingStatus: 'COMPLETED',
      },
    });

    // Resolve item prices/stock from branch inventory for the POS cart
    const itemsWithPrice = await Promise.all(
      dto.items.map(async (item) => {
        let price = 0;
        let available = false;
        if (item.medicationId) {
          const med = await this.prisma.medication.findFirst({
            where: { id: item.medicationId, branchId },
            select: { id: true, name: true, price: true, quantity: true },
          });
          if (med) {
            price = Number(med.price);
            available = med.quantity >= item.quantity;
          }
        }
        return { ...item, price, available };
      }),
    );

    // Optional: create a structured order on behalf of the patient
    let order: unknown = null;
    if (dto.createOrder) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { pharmacyId: true },
      });
      if (!branch) throw new NotFoundException('Branch not found');
      if (!prescription.patient)
        throw new BadRequestException('Prescription has no patient');

      order = await this.ordersService.create(staffUserId, {
        pharmacyId: branch.pharmacyId,
        branchId,
        type: dto.type ?? 'PICKUP',
        items: dto.items
          .filter((i) => i.medicationId)
          .map((i) => ({
            medicationId: i.medicationId,
            quantity: i.quantity,
          })),
        paymentMethod: dto.paymentMethod ?? 'CASH',
        patientId: prescription.patient.id,
        prescriptionId,
      });
    }

    return {
      prescription: updated,
      items: itemsWithPrice,
      order,
    };
  }
}
