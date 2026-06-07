// backend/src/patients/patients.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLocalSymptomFallback } from '../utils/symptom-fallback.util';
import { GrantConsentDto } from './dto/grant-consent.dto';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // ========================================
  // AI SYMPTOM CHECKER (FREE TIER & FALLBACK)
  // ========================================
  async symptomCheck(symptoms: string) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not set - falling back to keyword matrix');
      return getLocalSymptomFallback(symptoms);
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });

      const prompt = `Analyze the following patient symptoms and recommend matching medical specialty categories (e.g. Cardiology, Dermatology, Pediatrics, Neurology, etc.).
Patient symptoms: "${symptoms}"

You must return a JSON object with this exact structure:
{
  "specialties": [
    {
      "name": "Specialty Name",
      "reasoning": "Brief explanation of why this specialty is recommended",
      "urgency": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    }
  ],
  "disclaimer": "Standard medical disclaimer that this is not a substitute for professional medical advice."
}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Gemini response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.specialties && Array.isArray(parsed.specialties)) {
        return parsed;
      }
      throw new Error('Invalid JSON structure returned from Gemini');
    } catch (error: any) {
      console.error('Gemini symptom check failed, falling back:', error);
      return getLocalSymptomFallback(symptoms);
    }
  }

  // ========================================================
  // GRANT 7-DAY CONSENT RIGHTS TO NON-TREATING DOCTOR
  // ========================================================
  async grantConsent(userId: string, dto: GrantConsentDto) {
    const patient = await this.findByUserId(userId);

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const existingAccess = await this.prisma.medicalHistoryAccess.findFirst({
      where: {
        doctorId: dto.doctorId,
        patientId: patient.id,
      },
    });

    if (existingAccess) {
      const updatedAccess = await this.prisma.medicalHistoryAccess.update({
        where: { id: existingAccess.id },
        data: { expiresAt },
      });
      return {
        message: 'Consent updated successfully. Doctor has 7-day read rights.',
        consent: updatedAccess,
      };
    }

    const newAccess = await this.prisma.medicalHistoryAccess.create({
      data: {
        doctorId: dto.doctorId,
        patientId: patient.id,
        expiresAt,
      },
    });

    return {
      message: 'Consent granted successfully. Doctor has 7-day read rights.',
      consent: newAccess,
    };
  }

  // ========================================
  // FIND PATIENT BY USER ID
  // ========================================

  async findByUserId(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  // ========================================
  // FIND PATIENT BY ID
  // ========================================

  async findById(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, createdAt: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  // ========================================
  // UPDATE PATIENT (Direct method for internal use)
  // ========================================

  async update(id: string, dto: UpdatePatientDto) {
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });

    return patient;
  }

  // ========================================
  // GET PATIENT PROFILE
  // ========================================

  async getProfile(userId: string) {
    return this.findByUserId(userId);
  }

  // ========================================
  // UPDATE PATIENT PROFILE (Via User ID)
  // ========================================

  async updateProfile(userId: string, dto: UpdatePatientDto) {
    const patient = await this.findByUserId(userId);

    const updatedPatient = await this.prisma.patient.update({
      where: { id: patient.id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });

    return {
      message: 'Profile updated successfully',
      patient: updatedPatient,
    };
  }

  // ========================================
  // UPDATE INSURANCE INFO
  // ========================================

  async updateInsuranceInfo(
    userId: string,
    insuranceData: {
      insuranceProvider?: string;
      insurancePolicy?: string;
      insuranceMemberId?: string;
      insuranceCoverage?: number;
    },
  ) {
    const patient = await this.findByUserId(userId);

    return this.prisma.patient.update({
      where: { id: patient.id },
      data: insuranceData,
    });
  }

  // ========================================
  // GET PATIENT WITH ORDERS
  // ========================================

  async getPatientWithOrders(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      include: {
        orders: {
          include: {
            pharmacy: true,
            orderItems: {
              include: {
                medication: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  // ========================================================
  // NEW MASTER MEDICAL HISTORY VIA MRN OR Patient ID (HIPAA Guarded & Audited)
  // ========================================================
  async getMasterMedicalHistory(
    mrn: string,
    userPayload: any,
    page: string,
    limit: string,
  ) {
    // 1. Resolve patient using either global MRN, hospital MRN, or direct UUID patient ID
    const patient = await this.prisma.patient.findFirst({
      where: {
        OR: [
          { id: mrn },
          { mrn: mrn },
          { hospitalRegistrations: { some: { mrn: mrn } } },
        ],
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with MRN or ID "${mrn}" not found`);
    }

    let accessType = 'PATIENT_OWN';
    let doctorId: string | null = null;

    // 2. Consent-Based HIPAA Privacy Guard
    if (userPayload.role === 'PATIENT') {
      if (patient.userId !== userPayload.sub) {
        throw new ForbiddenException(
          'You can only access your own medical records',
        );
      }
      accessType = 'PATIENT_OWN';
    } else if (userPayload.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: userPayload.sub },
      });
      if (!doctor) {
        throw new ForbiddenException('Doctor clinical profile not found');
      }
      doctorId = doctor.id;

      // Rule A: Active treating doctor boundary (active appointment: status in scheduled, arrived, in triage, ready for doctor)
      const activeAppointment = await this.prisma.appointment.findFirst({
        where: {
          patientId: patient.id,
          doctorId: doctor.id,
          status: {
            in: ['SCHEDULED', 'ARRIVED', 'IN_TRIAGE', 'READY_FOR_DOCTOR'],
          },
        },
      });

      if (activeAppointment) {
        accessType = 'TREAT_DOCTOR';
      } else {
        // Rule B: Temporary access token/consent check (expiresAt > now)
        const now = new Date();
        const validConsent = await this.prisma.medicalHistoryAccess.findFirst({
          where: {
            patientId: patient.id,
            doctorId: doctor.id,
            expiresAt: {
              gt: now,
            },
          },
        });

        if (!validConsent) {
          throw new ForbiddenException(
            'Access Denied: You must be a treating doctor with an active appointment or have active patient consent to read this medical history.',
          );
        }
        accessType = 'CONSENT_TOKEN';
      }
    } else if (userPayload.role === 'SUPER_ADMIN' || userPayload.role === 'HOSPITAL_ADMIN') {
      accessType = 'ADMIN';
    } else {
      throw new ForbiddenException('Role not authorized to access medical records');
    }

    // Log the read request to the database-side immutable audit log
    await this.prisma.medicalRecordLog.create({
      data: {
        doctorId,
        patientId: patient.id,
        accessType,
        reason: `Aggregated medical history read for patient ${patient.id} requested by ${userPayload.role} ${userPayload.sub}`,
      },
    });

    // 3. Process Safe Pagination Arithmetic
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    // 4. Parallel Query Aggregation
    const [
      appointments,
      prescriptions,
      invoices,
      totalAppointments,
      totalPrescriptions,
      totalInvoices,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: patient.id },
        include: { triageVitals: true },
        orderBy: { date: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.prescription.findMany({
        where: { patientId: patient.id },
        include: { prescriptionMedications: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.hospitalInvoice.findMany({
        where: { patientId: patient.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.appointment.count({ where: { patientId: patient.id } }),
      this.prisma.prescription.count({ where: { patientId: patient.id } }),
      this.prisma.hospitalInvoice.count({ where: { patientId: patient.id } }),
    ]);

    return {
      demographics: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: (patient as any).bloodGroup || null,
        insuranceProvider: patient.insuranceProvider,
      },
      appointments,
      prescriptions,
      invoices,
      meta: {
        currentPage: pageNum,
        limit: limitNum,
        totalAppointments,
        totalPrescriptions,
        totalInvoices,
      },
    };
  }
}
