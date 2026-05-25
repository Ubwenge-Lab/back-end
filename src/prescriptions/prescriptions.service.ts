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
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrescriptionMedication } from '@prisma/client';

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

        // Create parent prescription
        const prescription = await tx.prescription.create({
          data: {
            patientId: dto.patientId,
            doctorId: doctor.id,
            hospitalId: dto.hospitalId,
            appointmentId: dto.appointmentId,
            diagnosis: appointment.diagnosisSummary || 'Clinical Consultation',
            status: 'APPROVED',
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
}
