// backend/src/prescriptions/prescriptions.service.ts
// GEMINI AI VERSION - Free prescription reading

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicationsService } from '../medications/medications.service';
import { CreatePrescriptionDto, UpdatePrescriptionStatusDto } from './dto';
import { StaffService } from '../staff/staff.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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
}
