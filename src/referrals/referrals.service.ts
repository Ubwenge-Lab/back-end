import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { generateReferralPdf } from './utils/referral-pdf.builder';
import { signReferralPayload } from './utils/webhook-signer.util';

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async createReferral(userId: string, dto: CreateReferralDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) {
      throw new ForbiddenException('Only doctors can initiate a referral');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const targetHospital = await this.prisma.hospital.findUnique({
      where: { id: dto.targetHospitalId },
    });
    if (!targetHospital)
      throw new NotFoundException('Target hospital not found');

    if (targetHospital.id === doctor.hospitalId) {
      throw new BadRequestException(
        'Cannot refer a patient to the hospital they are already at',
      );
    }

    return this.prisma.referral.create({
      data: {
        patientId: dto.patientId,
        sourceHospitalId: doctor.hospitalId,
        targetHospitalId: dto.targetHospitalId,
        authorizingDoctorId: doctor.id,
        reason: dto.reason,
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        sourceHospital: { select: { name: true } },
        targetHospital: { select: { name: true } },
      },
    });
  }

  async packageReferral(referralId: string, userId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        patient: true,
        sourceHospital: true,
        targetHospital: true,
        authorizingDoctor: true,
      },
    });

    if (!referral) throw new NotFoundException('Referral not found');

    const requestingDoctor = await this.prisma.doctor.findUnique({
      where: { userId },
    });
    if (
      !requestingDoctor ||
      requestingDoctor.id !== referral.authorizingDoctorId
    ) {
      throw new ForbiddenException(
        'Only the authorizing doctor can package this referral',
      );
    }

    if (referral.status !== 'PENDING') {
      throw new ConflictException(
        `Referral has already been packaged (status: ${referral.status})`,
      );
    }

    // Pull only verified, hospital-stay-scoped clinical data — not the
    // patient's full cross-hospital history.
    const [appointments, prescriptions] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          patientId: referral.patientId,
          hospitalId: referral.sourceHospitalId,
          status: 'COMPLETED',
        },
        include: { triageVitals: true },
        orderBy: { date: 'desc' },
      }),
      this.prisma.prescription.findMany({
        where: {
          patientId: referral.patientId,
          hospitalId: referral.sourceHospitalId,
          status: 'APPROVED',
        },
        include: { prescriptionMedications: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const exportPayload = {
      referralId: referral.id,
      generatedAt: new Date().toISOString(),
      reason: referral.reason,
      patient: {
        firstName: referral.patient.firstName,
        lastName: referral.patient.lastName,
        dateOfBirth: referral.patient.dateOfBirth,
        gender: referral.patient.gender,
        insuranceProvider: referral.patient.insuranceProvider,
      },
      sourceHospital: {
        name: referral.sourceHospital.name,
        address: referral.sourceHospital.address,
        phone: referral.sourceHospital.phone,
      },
      targetHospital: {
        name: referral.targetHospital.name,
      },
      authorizingDoctor: {
        name: `Dr. ${referral.authorizingDoctor.firstName ?? ''} ${referral.authorizingDoctor.lastName ?? ''}`.trim(),
        specialization: referral.authorizingDoctor.specialization,
        licenseNumber: referral.authorizingDoctor.licenseNumber,
      },
      clinicalHistory: {
        appointments: appointments.map((a) => ({
          date: a.date,
          reason: a.reason,
          diagnosisSummary: a.diagnosisSummary,
          doctorRecommendations: a.doctorRecommendations,
          vitals: a.triageVitals
            ? {
                bloodPressure: a.triageVitals.bloodPressure,
                temperature: a.triageVitals.temperature,
                heartRate: a.triageVitals.heartRate,
                oxygenSaturation: a.triageVitals.oxygenSaturation,
              }
            : null,
        })),
        prescriptions: prescriptions.map((p) => ({
          diagnosis: p.diagnosis,
          notes: p.notes,
          issuedAt: p.createdAt,
          medications: p.prescriptionMedications,
        })),
      },
    };

    const pdfFilePath = await generateReferralPdf(exportPayload);

    return this.prisma.referral.update({
      where: { id: referralId },
      data: {
        emrJsonPayload: exportPayload,
        emrPdfFileUrl: pdfFilePath,
        exportedAt: new Date(),
        status: 'PACKAGED',
      },
    });
  }

  async sendReferralWebhook(referralId: string, userId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        patient: true,
        sourceHospital: true,
        targetHospital: true,
        authorizingDoctor: true,
      },
    });

    if (!referral) throw new NotFoundException('Referral not found');

    const requestingDoctor = await this.prisma.doctor.findUnique({
      where: { userId },
    });
    if (
      !requestingDoctor ||
      requestingDoctor.id !== referral.authorizingDoctorId
    ) {
      throw new ForbiddenException(
        'Only the authorizing doctor can send this referral',
      );
    }

    if (referral.status !== 'PACKAGED') {
      throw new BadRequestException(
        'Referral must be packaged (EMR export generated) before it can be sent',
      );
    }

    if (
      !referral.targetHospital.referralWebhookUrl ||
      !referral.targetHospital.referralWebhookSecret
    ) {
      throw new BadRequestException(
        `${referral.targetHospital.name} has not configured a referral webhook endpoint`,
      );
    }

    const timestamp = Date.now().toString();
    const alertPayload = {
      referralId: referral.id,
      sourceHospital: {
        name: referral.sourceHospital.name,
        phone: referral.sourceHospital.phone,
      },
      targetHospital: { name: referral.targetHospital.name },
      patient: {
        firstName: referral.patient.firstName,
        lastName: referral.patient.lastName,
      },
      reason: referral.reason,
      authorizingDoctor:
        `Dr. ${referral.authorizingDoctor.firstName ?? ''} ${referral.authorizingDoctor.lastName ?? ''}`.trim(),
      packagedAt: referral.exportedAt,
    };

    const signature = signReferralPayload(
      referral.targetHospital.referralWebhookSecret,
      timestamp,
      alertPayload,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          referral.targetHospital.referralWebhookUrl,
          alertPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Evuze-Signature': signature,
              'X-Evuze-Timestamp': timestamp,
            },
            timeout: 10000,
          },
        ),
      );

      return this.prisma.referral.update({
        where: { id: referralId },
        data: {
          status: 'SENT',
          webhookSignature: signature,
          webhookHttpStatus: response.status,
          webhookAttemptedAt: new Date(),
          webhookError: null,
        },
      });
    } catch (error: any) {
      await this.prisma.referral.update({
        where: { id: referralId },
        data: {
          status: 'FAILED',
          webhookSignature: signature,
          webhookHttpStatus: error.response?.status ?? null,
          webhookAttemptedAt: new Date(),
          webhookError: error.response?.data?.message || error.message,
        },
      });

      throw new BadRequestException(
        `Failed to deliver referral webhook: ${error.response?.data?.message || error.message}`,
      );
    }
  }
}
