import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { LogVitalsDto } from './dto/log-vitals.dto';
import { LogMarDto } from './dto/log-mar.dto';
import { CreateHandoverDto } from './dto/create-handover.dto';

@Injectable()
export class InpatientService {
  constructor(private readonly prisma: PrismaService) {}

  // =============================================
  // SHARED HELPERS
  // =============================================

  private async resolveStaff(userId: string) {
    const staff = await this.prisma.hospitalStaff.findFirst({ where: { userId } });
    if (!staff) throw new ForbiddenException('You are not registered as hospital staff');
    return staff;
  }

  /**
   * Resolves the admitting party — works for DOCTOR, HOSPITAL_ADMIN, and
   * hospital staff roles. Returns hospitalId, name, and role label for
   * storing on the admission record.
   *
   * NOTE: HOSPITAL_ADMIN is handled separately from resolveStaff() because
   * admin accounts are not HospitalStaff rows (that table is for
   * nurses/receptionists created under a hospital) — an admin's identity
   * resolves via Hospital.userId, same as analytics.service.ts does for
   * getHospitalMetrics(). Previously HOSPITAL_ADMIN fell through to
   * resolveStaff() and always got a 403 ("You are not registered as
   * hospital staff") despite being an allowed role on these routes.
   */
  private async resolveAdmitter(userId: string, role: string) {
    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findFirst({ where: { userId } });
      if (!doctor) throw new ForbiddenException('Doctor profile not found');
      const name = [doctor.firstName, doctor.lastName].filter(Boolean).join(' ') || 'Doctor';
      return { hospitalId: doctor.hospitalId, name: `Dr. ${name}`, role: 'DOCTOR' };
    }

    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
      });
      if (!hospital) throw new ForbiddenException('Hospital profile not found');
      return {
        hospitalId: hospital.id,
        name: hospital.name,
        role: 'HOSPITAL_ADMIN',
      };
    }

    const staff = await this.resolveStaff(userId);
    return {
      hospitalId: staff.hospitalId,
      name: `${staff.firstName} ${staff.lastName}`,
      role,
    };
  }

  private async resolveAdmission(admissionId: string) {
    const admission = await this.prisma.inpatientAdmission.findUnique({
      where: { id: admissionId },
    });
    if (!admission) throw new NotFoundException('Admission not found');
    return admission;
  }

  private assertSameHospital(staffHospitalId: string, admissionHospitalId: string) {
    if (staffHospitalId !== admissionHospitalId) {
      throw new ForbiddenException("You do not belong to this patient's admitting hospital");
    }
  }

  // =============================================
  // ADMISSIONS
  // =============================================

  async createAdmission(userId: string, role: string, dto: CreateAdmissionDto) {
    const admitter = await this.resolveAdmitter(userId, role);

    if (admitter.hospitalId !== dto.hospitalId) {
      throw new ForbiddenException('You can only admit patients into your own hospital');
    }

    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const hospital = await this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const existing = await this.prisma.inpatientAdmission.findFirst({
      where: { patientId: dto.patientId, hospitalId: dto.hospitalId, status: 'ACTIVE' },
    });
    if (existing) {
      throw new ConflictException('Patient already has an active admission at this hospital');
    }

    return this.prisma.inpatientAdmission.create({
      data: {
        patientId: dto.patientId,
        hospitalId: dto.hospitalId,
        admittedByUserId: userId,
        admittedByName: admitter.name,
        admittedByRole: admitter.role,
        reason: dto.reason,
        wardName: dto.wardName,
        bedNumber: dto.bedNumber,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        hospital: { select: { id: true, name: true } },
      },
    });
  }

  async listAdmissions(userId: string, role: string, hospitalId?: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const targetHospitalId = hospitalId ?? admitter.hospitalId;

    if (admitter.hospitalId !== targetHospitalId) {
      throw new ForbiddenException("Access denied to this hospital's admissions");
    }

    return this.prisma.inpatientAdmission.findMany({
      where: { hospitalId: targetHospitalId },
      orderBy: { admittedAt: 'desc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { vitals: true, marLogs: true, handovers: true } },
      },
    });
  }

  async getAdmission(admissionId: string, userId: string, role: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

    return this.prisma.inpatientAdmission.findUnique({
      where: { id: admissionId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        hospital: { select: { id: true, name: true } },
        vitals: { orderBy: { recordedAt: 'desc' }, take: 10 },
        marLogs: { orderBy: { administeredAt: 'desc' }, take: 10 },
        handovers: { orderBy: { handedOverAt: 'desc' }, take: 5 },
      },
    });
  }

  async dischargeAdmission(admissionId: string, userId: string, role: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

    if (admission.status !== 'ACTIVE') {
      throw new ConflictException(`Admission is already ${admission.status.toLowerCase()}`);
    }

    return this.prisma.inpatientAdmission.update({
      where: { id: admissionId },
      data: { status: 'DISCHARGED', dischargedAt: new Date() },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // =============================================
  // VITALS — free-form readings + checklist
  // =============================================

  async logVitals(admissionId: string, userId: string, dto: LogVitalsDto) {
    const staff = await this.resolveStaff(userId);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(staff.hospitalId, admission.hospitalId);

    if (admission.status !== 'ACTIVE') {
      throw new ConflictException('Cannot log vitals for a non-active admission');
    }

    return this.prisma.inpatientVitals.create({
      data: {
        admissionId,
        recordedById: staff.id,
        readings: dto.readings as object[],
        checklist: dto.checklist as object,
        nurseNotes: dto.nurseNotes,
      },
      include: {
        nurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listVitals(admissionId: string, userId: string, role: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

    return this.prisma.inpatientVitals.findMany({
      where: { admissionId },
      orderBy: { recordedAt: 'asc' },
      include: {
        nurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // =============================================
  // MAR — Medication Administration Record
  // Write-once — no update or delete
  // =============================================

  async logMar(admissionId: string, userId: string, dto: LogMarDto) {
    const staff = await this.resolveStaff(userId);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(staff.hospitalId, admission.hospitalId);

    if (admission.status !== 'ACTIVE') {
      throw new ConflictException('Cannot log medication administration for a non-active admission');
    }

    return this.prisma.mARLog.create({
      data: {
        admissionId,
        administeredById: staff.id,
        medicationName: dto.medicationName,
        dose: dto.dose,
        route: dto.route,
        prescriptionMedId: dto.prescriptionMedId,
        administeredAt: new Date(dto.administeredAt),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        notes: dto.notes,
      },
      include: {
        nurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listMar(admissionId: string, userId: string, role: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

    return this.prisma.mARLog.findMany({
      where: { admissionId },
      orderBy: { administeredAt: 'asc' },
      include: {
        nurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // =============================================
  // NURSING HANDOVER CHECKLISTS
  // =============================================

  async createHandover(admissionId: string, userId: string, dto: CreateHandoverDto) {
    const staff = await this.resolveStaff(userId);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(staff.hospitalId, admission.hospitalId);

    if (admission.status !== 'ACTIVE') {
      throw new ConflictException('Cannot create a handover for a non-active admission');
    }

    if (dto.incomingNurseId) {
      const incomingNurse = await this.prisma.hospitalStaff.findFirst({
        where: { id: dto.incomingNurseId, hospitalId: staff.hospitalId },
      });
      if (!incomingNurse) throw new NotFoundException('Incoming nurse not found at this hospital');
    }

    return this.prisma.nursingHandover.create({
      data: {
        admissionId,
        handedOverById: staff.id,
        receivedById: dto.incomingNurseId ?? null,
        shiftType: dto.shiftType,
        checklist: dto.checklist as object,
        notes: dto.notes,
      },
      include: {
        outgoingNurse: { select: { id: true, firstName: true, lastName: true } },
        incomingNurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listHandovers(admissionId: string, userId: string, role: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

    return this.prisma.nursingHandover.findMany({
      where: { admissionId },
      orderBy: { handedOverAt: 'desc' },
      include: {
        outgoingNurse: { select: { id: true, firstName: true, lastName: true } },
        incomingNurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async acknowledgeHandover(admissionId: string, handoverId: string, userId: string) {
    const staff = await this.resolveStaff(userId);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(staff.hospitalId, admission.hospitalId);

    const handover = await this.prisma.nursingHandover.findUnique({ where: { id: handoverId } });
    if (!handover) throw new NotFoundException('Handover record not found');
    if (handover.admissionId !== admissionId) {
      throw new NotFoundException('Handover does not belong to this admission');
    }
    if (handover.receivedById) {
      throw new ConflictException('Handover has already been acknowledged');
    }
    if (handover.handedOverById === staff.id) {
      throw new ConflictException('You cannot acknowledge your own handover');
    }

    return this.prisma.nursingHandover.update({
      where: { id: handoverId },
      data: { receivedById: staff.id },
      include: {
        outgoingNurse: { select: { id: true, firstName: true, lastName: true } },
        incomingNurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
