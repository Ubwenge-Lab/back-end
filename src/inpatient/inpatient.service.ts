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
import { TransferBedDto } from './dto/transfer-bed.dto';
import { UpdateBedStatusDto } from './dto/update-bed-status.dto';
import { AdmissionStatus, BedStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common/exceptions';
import { DischargeAdmissionDto } from './dto/discharge-admission.dto';

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

    // Check bed availability before proceeding
    if (dto.bedId) {
      const bed = await this.prisma.bed.findUnique({ where: { id: dto.bedId } });
      if (!bed || bed.status !== BedStatus.AVAILABLE) {
        throw new BadRequestException('The selected bed is not available.');
      }
    }

    // Wrap admission and bed allocation in an atomic transaction
    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.inpatientAdmission.create({
        data: {
          patientId: dto.patientId,
          hospitalId: dto.hospitalId,
          admittedByUserId: userId,
          admittedByName: admitter.name,
          admittedByRole: admitter.role,
          reason: dto.reason,
          wardName: dto.wardName,
          bedNumber: dto.bedNumber,
          bedId: dto.bedId, // Ensure bedId is mapped
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          hospital: { select: { id: true, name: true } },
        },
      });

      // Mark the bed as occupied
      if (dto.bedId) {
        await tx.bed.update({
          where: { id: dto.bedId },
          data: { status: BedStatus.OCCUPIED, isOccupied: true },
        });
      }

      return admission;
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

  async dischargeAdmission(admissionId: string, userId: string, role: string, dto: DischargeAdmissionDto) {
    const admitter = await this.resolveAdmitter(userId, role);
    const admission = await this.resolveAdmission(admissionId);
    
    this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

    if (admission.status !== 'ACTIVE') {
      throw new ConflictException(`Admission is already ${admission.status.toLowerCase()}`);
    }

    // NEW: Enforce Clearance logic
    const clinicalCleared = dto.clinicalClearance ?? admission.clinicalCleared;
    const billingCleared = dto.billingClearance ?? admission.billingCleared;

    if (!clinicalCleared || !billingCleared) {
      throw new BadRequestException('Cannot discharge patient. Both clinical and billing clearances are required.');
    }

    // NEW: Wrap discharge and bed freeing in a transaction
    return this.prisma.$transaction(async (tx) => {
      const discharged = await tx.inpatientAdmission.update({
        where: { id: admissionId },
        data: { 
          status: 'DISCHARGED', 
          dischargedAt: new Date(),
          clinicalCleared,
          billingCleared,
          dischargeNotes: dto.notes,
          dischargedByUserId: userId,
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // Free the bed and flag for cleaning
      if (admission.bedId) {
        await tx.bed.update({
          where: { id: admission.bedId },
          data: { status: BedStatus.CLEANING, isOccupied: false },
        });
      }

      return discharged;
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


  /**
   * Update individual bed status and sync the isOccupied flag
   */
  async updateBedStatus(bedId: string, dto: UpdateBedStatusDto) {
    const bed = await this.prisma.bed.findUnique({ where: { id: bedId } });
    if (!bed) {
      throw new NotFoundException(`Bed with ID ${bedId} not found.`);
    }

    const isOccupied = dto.status === BedStatus.OCCUPIED;

    return this.prisma.bed.update({
      where: { id: bedId },
      data: {
        status: dto.status,
        isOccupied,
      },
    });
  }

  /**
   * Transfer an admitted patient to a new bed atomically using a transaction
   */
  async transferBed(admissionId: string, userId: string, dto: TransferBedDto) {
    const admission = await this.prisma.inpatientAdmission.findUnique({
      where: { id: admissionId },
      include: { bed: true },
    });

    if (!admission) {
      throw new NotFoundException(`Admission with ID ${admissionId} not found.`);
    }

    if (admission.status !== AdmissionStatus.ACTIVE) {
      throw new BadRequestException('Cannot transfer a patient who does not have an active admission.');
    }

    const targetBed = await this.prisma.bed.findUnique({
      where: { id: dto.targetBedId },
    });

    if (!targetBed) {
      throw new NotFoundException(`Target bed with ID ${dto.targetBedId} not found.`);
    }

    if (targetBed.status !== BedStatus.AVAILABLE || targetBed.isOccupied) {
      throw new BadRequestException(`Target bed ${targetBed.number} is not available for occupancy.`);
    }

    const previousBedId = admission.bedId;

    // Execute transfer inside an atomic transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Free up the previous bed if it exists
      if (previousBedId) {
        await tx.bed.update({
          where: { id: previousBedId },
          data: { status: BedStatus.AVAILABLE, isOccupied: false },
        });
      }

      // 2. Mark target bed as occupied
      await tx.bed.update({
        where: { id: targetBed.id },
        data: { status: BedStatus.OCCUPIED, isOccupied: true },
      });

      // 3. Create the audit trail for the transfer
      const transferRecord = await tx.bedTransfer.create({
        data: {
          admissionId: admission.id,
          fromBedId: previousBedId,
          toBedId: targetBed.id,
          transferredByUserId: userId,
          reason: dto.reason,
        },
      });

      // 4. Update the admission record with the new bed and bed number reference
      await tx.inpatientAdmission.update({
        where: { id: admission.id },
        data: {
          bedId: targetBed.id,
          bedNumber: targetBed.number,
        },
      });

      return {
        message: 'Patient transferred successfully',
        transfer: transferRecord,
        newBed: targetBed,
      };
    });
  }

  /**
   * Get real-time occupancy breakdown for a hospital
   */
  async getHospitalOccupancyOverview(hospitalId: string) {
    const wards = await this.prisma.ward.findMany({
      where: { hospitalId },
      include: {
        beds: true,
      },
    });

    let totalBeds = 0;
    let occupiedBeds = 0;
    let availableBeds = 0;
    let maintenanceBeds = 0;

    const wardBreakdown = wards.map((ward) => {
      const wardTotal = ward.beds.length;
      const wardOccupied = ward.beds.filter((b) => b.isOccupied).length;
      const wardAvailable = ward.beds.filter((b) => !b.isOccupied).length;
      const wardMaintenance = 0;

      totalBeds += wardTotal;
      occupiedBeds += wardOccupied;
      availableBeds += wardAvailable;
      maintenanceBeds += wardMaintenance;

      return {
        wardId: ward.id,
        wardName: ward.name,
        tier: ward.tier,
        stats: {
          total: wardTotal,
          occupied: wardOccupied,
          available: wardAvailable,
          maintenance: wardMaintenance,
          occupancyRate: wardTotal > 0 ? Number(((wardOccupied / wardTotal) * 100).toFixed(2)) : 0,
        },
        beds: ward.beds,
      };
    });

    return {
      summary: {
        totalBeds,
        occupiedBeds,
        availableBeds,
        maintenanceBeds,
        overallOccupancyRate: totalBeds > 0 ? Number(((occupiedBeds / totalBeds) * 100).toFixed(2)) : 0,
      },
      wards: wardBreakdown,
    };
  }
}
