import {
  BadRequestException,
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
import {
  AdmissionStatus,
  BedStatus,
  HospitalBillingStatus,
  Prisma,
} from '@prisma/client';
import { DischargeAdmissionDto } from './dto/discharge-admission.dto';

@Injectable()
export class InpatientService {
  constructor(private readonly prisma: PrismaService) {}

  // =============================================
  // SHARED HELPERS
  // =============================================

  private async resolveStaff(userId: string) {
    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId },
    });
    if (!staff)
      throw new ForbiddenException('You are not registered as hospital staff');
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
      const name =
        [doctor.firstName, doctor.lastName].filter(Boolean).join(' ') ||
        'Doctor';
      return {
        hospitalId: doctor.hospitalId,
        name: `Dr. ${name}`,
        role: 'DOCTOR',
      };
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

  private assertSameHospital(
    staffHospitalId: string,
    admissionHospitalId: string,
  ) {
    if (staffHospitalId !== admissionHospitalId) {
      throw new ForbiddenException(
        "You do not belong to this patient's admitting hospital",
      );
    }
  }

  // =============================================
  // ADMISSIONS
  // =============================================

  async createAdmission(userId: string, role: string, dto: CreateAdmissionDto) {
    const admitter = await this.resolveAdmitter(userId, role);

    if (admitter.hospitalId !== dto.hospitalId) {
      throw new ForbiddenException(
        'You can only admit patients into your own hospital',
      );
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: dto.hospitalId },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');

    return this.prisma.$transaction(async (tx) => {
      // Serialize admissions for the same patient so two concurrent requests
      // cannot both pass the active-admission check.
      await tx.$queryRaw`
        SELECT id
        FROM patients
        WHERE id = ${dto.patientId}
        FOR UPDATE
      `;

      const existing = await tx.inpatientAdmission.findFirst({
        where: {
          patientId: dto.patientId,
          hospitalId: dto.hospitalId,
          status: AdmissionStatus.ACTIVE,
        },
      });
      if (existing) {
        throw new ConflictException(
          'Patient already has an active admission at this hospital',
        );
      }

      let selectedBed: {
        id: string;
        number: string;
        wardId: string;
        roomId: string | null;
        status: BedStatus;
        isOccupied: boolean;
        ward: { name: string };
      } | null = null;

      if (dto.wardId || dto.roomId) {
        if (!dto.bedId) {
          throw new BadRequestException(
            'bedId is required when wardId or roomId is provided',
          );
        }
      }

      if (dto.bedId) {
        await tx.$queryRaw`
          SELECT id
          FROM beds
          WHERE id = ${dto.bedId}
          FOR UPDATE
        `;

        selectedBed = await tx.bed.findFirst({
          where: {
            id: dto.bedId,
            ward: { hospitalId: dto.hospitalId },
          },
          select: {
            id: true,
            number: true,
            wardId: true,
            roomId: true,
            status: true,
            isOccupied: true,
            ward: { select: { name: true } },
          },
        });

        if (!selectedBed) {
          throw new NotFoundException(
            'Selected bed was not found in the admitting hospital',
          );
        }
        if (dto.wardId && selectedBed.wardId !== dto.wardId) {
          throw new BadRequestException(
            'Selected bed does not belong to the supplied ward',
          );
        }
        if (dto.roomId && selectedBed.roomId !== dto.roomId) {
          throw new BadRequestException(
            'Selected bed does not belong to the supplied room',
          );
        }

        const claim = await tx.bed.updateMany({
          where: {
            id: selectedBed.id,
            status: BedStatus.AVAILABLE,
            isOccupied: false,
          },
          data: {
            status: BedStatus.OCCUPIED,
            isOccupied: true,
            statusNotes: null,
          },
        });
        if (claim.count !== 1) {
          throw new ConflictException(
            'The selected bed is no longer available',
          );
        }
      }

      const admission = await tx.inpatientAdmission.create({
        data: {
          patientId: dto.patientId,
          hospitalId: dto.hospitalId,
          admittedByUserId: userId,
          admittedByName: admitter.name,
          admittedByRole: admitter.role,
          reason: dto.reason,
          wardName: selectedBed?.ward.name ?? dto.wardName,
          bedNumber: selectedBed?.number ?? dto.bedNumber,
          bedId: selectedBed?.id,
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          hospital: { select: { id: true, name: true } },
        },
      });

      return admission;
    });
  }
  async listAdmissions(userId: string, role: string, hospitalId?: string) {
    const admitter = await this.resolveAdmitter(userId, role);
    const targetHospitalId = hospitalId ?? admitter.hospitalId;

    if (admitter.hospitalId !== targetHospitalId) {
      throw new ForbiddenException(
        "Access denied to this hospital's admissions",
      );
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
        patient: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        hospital: { select: { id: true, name: true } },
        vitals: { orderBy: { recordedAt: 'desc' }, take: 10 },
        marLogs: { orderBy: { administeredAt: 'desc' }, take: 10 },
        handovers: { orderBy: { handedOverAt: 'desc' }, take: 5 },
      },
    });
  }

  async grantClinicalClearance(
    admissionId: string,
    userId: string,
    role: string,
  ) {
    if (role !== 'DOCTOR') {
      throw new ForbiddenException(
        'Only a doctor can grant clinical discharge clearance',
      );
    }
    const admitter = await this.resolveAdmitter(userId, role);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM inpatient_admissions
        WHERE id = ${admissionId}
        FOR UPDATE
      `;
      const admission = await tx.inpatientAdmission.findUnique({
        where: { id: admissionId },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      this.assertSameHospital(admitter.hospitalId, admission.hospitalId);
      if (admission.status !== AdmissionStatus.ACTIVE) {
        throw new ConflictException(
          `Admission is already ${admission.status.toLowerCase()}`,
        );
      }

      return tx.inpatientAdmission.update({
        where: { id: admissionId },
        data: { clinicalCleared: true },
      });
    });
  }

  async dischargeAdmission(
    admissionId: string,
    userId: string,
    role: string,
    dto: DischargeAdmissionDto = {},
  ) {
    const admitter = await this.resolveAdmitter(userId, role);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM inpatient_admissions
        WHERE id = ${admissionId}
        FOR UPDATE
      `;
      const admission = await tx.inpatientAdmission.findUnique({
        where: { id: admissionId },
        include: { hospitalInvoice: true },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      this.assertSameHospital(admitter.hospitalId, admission.hospitalId);

      if (admission.status !== AdmissionStatus.ACTIVE) {
        throw new ConflictException(
          `Admission is already ${admission.status.toLowerCase()}`,
        );
      }
      if (!admission.clinicalCleared) {
        throw new BadRequestException(
          'Clinical clearance must be granted by a doctor before discharge',
        );
      }

      const billingCleared =
        !admission.hospitalInvoice ||
        admission.hospitalInvoice.paymentStatus === HospitalBillingStatus.PAID;
      if (!billingCleared) {
        throw new BadRequestException(
          'The admission invoice must be paid before discharge',
        );
      }
      if (dto.notes && role !== 'DOCTOR') {
        throw new ForbiddenException(
          'Only a doctor can author clinical discharge notes',
        );
      }

      if (admission.bedId) {
        await tx.$queryRaw`
          SELECT id
          FROM beds
          WHERE id = ${admission.bedId}
          FOR UPDATE
        `;
      }

      const updateResult = await tx.inpatientAdmission.updateMany({
        where: { id: admissionId, status: AdmissionStatus.ACTIVE },
        data: {
          status: AdmissionStatus.DISCHARGED,
          dischargedAt: new Date(),
          billingCleared: true,
          dischargeNotes: dto?.notes,
          dischargedByUserId: userId,
        },
      });
      if (updateResult.count !== 1) {
        throw new ConflictException('Admission state changed during discharge');
      }

      if (admission.bedId) {
        const bedUpdate = await tx.bed.updateMany({
          where: {
            id: admission.bedId,
            status: BedStatus.OCCUPIED,
            isOccupied: true,
          },
          data: {
            status: BedStatus.CLEANING,
            isOccupied: false,
            statusNotes: 'Awaiting cleaning after patient discharge',
          },
        });
        if (bedUpdate.count !== 1) {
          throw new ConflictException(
            'Assigned bed state changed during discharge',
          );
        }
      }

      return tx.inpatientAdmission.findUnique({
        where: { id: admissionId },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      });
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
      throw new ConflictException(
        'Cannot log vitals for a non-active admission',
      );
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
      throw new ConflictException(
        'Cannot log medication administration for a non-active admission',
      );
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

  async createHandover(
    admissionId: string,
    userId: string,
    dto: CreateHandoverDto,
  ) {
    const staff = await this.resolveStaff(userId);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(staff.hospitalId, admission.hospitalId);

    if (admission.status !== 'ACTIVE') {
      throw new ConflictException(
        'Cannot create a handover for a non-active admission',
      );
    }

    if (dto.incomingNurseId) {
      const incomingNurse = await this.prisma.hospitalStaff.findFirst({
        where: { id: dto.incomingNurseId, hospitalId: staff.hospitalId },
      });
      if (!incomingNurse)
        throw new NotFoundException(
          'Incoming nurse not found at this hospital',
        );
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
        outgoingNurse: {
          select: { id: true, firstName: true, lastName: true },
        },
        incomingNurse: {
          select: { id: true, firstName: true, lastName: true },
        },
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
        outgoingNurse: {
          select: { id: true, firstName: true, lastName: true },
        },
        incomingNurse: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async acknowledgeHandover(
    admissionId: string,
    handoverId: string,
    userId: string,
  ) {
    const staff = await this.resolveStaff(userId);
    const admission = await this.resolveAdmission(admissionId);
    this.assertSameHospital(staff.hospitalId, admission.hospitalId);

    const handover = await this.prisma.nursingHandover.findUnique({
      where: { id: handoverId },
    });
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
        outgoingNurse: {
          select: { id: true, firstName: true, lastName: true },
        },
        incomingNurse: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Update individual bed status and sync the isOccupied flag
   */
  async updateBedStatus(
    userId: string,
    role: string,
    bedId: string,
    dto: UpdateBedStatusDto,
  ) {
    const actor = await this.resolveAdmitter(userId, role);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM beds
        WHERE id = ${bedId}
        FOR UPDATE
      `;
      const bed = await tx.bed.findFirst({
        where: {
          id: bedId,
          ward: { hospitalId: actor.hospitalId },
        },
        include: {
          inpatientAdmissions: {
            where: { status: AdmissionStatus.ACTIVE },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!bed) {
        throw new NotFoundException('Bed not found in your hospital');
      }

      const hasActiveAdmission = bed.inpatientAdmissions.length > 0;
      if (hasActiveAdmission && dto.status !== BedStatus.OCCUPIED) {
        throw new ConflictException(
          'An occupied bed cannot change status while it has an active admission',
        );
      }
      if (!hasActiveAdmission && dto.status === BedStatus.OCCUPIED) {
        throw new ConflictException(
          'A bed can only become occupied through admission or transfer',
        );
      }

      return tx.bed.update({
        where: { id: bedId },
        data: {
          status: dto.status,
          isOccupied: hasActiveAdmission,
          statusNotes: dto.notes ?? null,
        },
      });
    });
  }

  /**
   * Transfer an admitted patient to a new bed atomically using a transaction
   */
  async transferBed(
    admissionId: string,
    userId: string,
    role: string,
    dto: TransferBedDto,
  ) {
    const actor = await this.resolveAdmitter(userId, role);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM inpatient_admissions
        WHERE id = ${admissionId}
        FOR UPDATE
      `;
      const admission = await tx.inpatientAdmission.findUnique({
        where: { id: admissionId },
      });
      if (!admission) {
        throw new NotFoundException('Admission not found');
      }
      this.assertSameHospital(actor.hospitalId, admission.hospitalId);
      if (admission.status !== AdmissionStatus.ACTIVE) {
        throw new BadRequestException(
          'Cannot transfer a patient without an active admission',
        );
      }

      const bedIds = [admission.bedId, dto.targetBedId]
        .filter((id): id is string => Boolean(id))
        .sort();
      await tx.$queryRaw(
        Prisma.sql`
          SELECT id
          FROM beds
          WHERE id IN (${Prisma.join(bedIds)})
          ORDER BY id
          FOR UPDATE
        `,
      );

      const targetBed = await tx.bed.findFirst({
        where: {
          id: dto.targetBedId,
          ward: { hospitalId: admission.hospitalId },
        },
        include: { ward: { select: { name: true } } },
      });
      if (!targetBed) {
        throw new NotFoundException(
          'Target bed was not found in the admitting hospital',
        );
      }

      const targetClaim = await tx.bed.updateMany({
        where: {
          id: targetBed.id,
          status: BedStatus.AVAILABLE,
          isOccupied: false,
        },
        data: {
          status: BedStatus.OCCUPIED,
          isOccupied: true,
          statusNotes: null,
        },
      });
      if (targetClaim.count !== 1) {
        throw new ConflictException(
          `Target bed ${targetBed.number} is no longer available`,
        );
      }

      if (admission.bedId) {
        const previousBedUpdate = await tx.bed.updateMany({
          where: {
            id: admission.bedId,
            status: BedStatus.OCCUPIED,
            isOccupied: true,
          },
          data: {
            status: BedStatus.CLEANING,
            isOccupied: false,
            statusNotes: 'Awaiting cleaning after patient transfer',
          },
        });
        if (previousBedUpdate.count !== 1) {
          throw new ConflictException(
            'Previous bed state changed during transfer',
          );
        }
      }

      const admissionUpdate = await tx.inpatientAdmission.updateMany({
        where: {
          id: admission.id,
          status: AdmissionStatus.ACTIVE,
          bedId: admission.bedId,
        },
        data: {
          bedId: targetBed.id,
          wardName: targetBed.ward.name,
          bedNumber: targetBed.number,
        },
      });
      if (admissionUpdate.count !== 1) {
        throw new ConflictException('Admission changed during bed transfer');
      }

      const transferRecord = await tx.bedTransfer.create({
        data: {
          admissionId: admission.id,
          fromBedId: admission.bedId,
          toBedId: targetBed.id,
          transferredByUserId: userId,
          reason: dto.reason,
        },
      });

      return {
        message: 'Patient transferred successfully',
        transfer: transferRecord,
        newBed: {
          ...targetBed,
          status: BedStatus.OCCUPIED,
          isOccupied: true,
          statusNotes: null,
        },
      };
    });
  }

  /**
   * Get real-time occupancy breakdown for a hospital
   */
  async getHospitalOccupancyOverview(
    userId: string,
    role: string,
    hospitalId: string,
  ) {
    const actor = await this.resolveAdmitter(userId, role);
    if (actor.hospitalId !== hospitalId) {
      throw new ForbiddenException(
        "Access denied to this hospital's bed occupancy",
      );
    }

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
    let cleaningBeds = 0;

    const wardBreakdown = wards.map((ward) => {
      const stats = ward.beds.reduce(
        (counts, bed) => {
          counts[bed.status] += 1;
          return counts;
        },
        {
          [BedStatus.AVAILABLE]: 0,
          [BedStatus.OCCUPIED]: 0,
          [BedStatus.MAINTENANCE]: 0,
          [BedStatus.CLEANING]: 0,
        },
      );
      const wardTotal = ward.beds.length;
      const wardOccupied = stats[BedStatus.OCCUPIED];
      const wardAvailable = stats[BedStatus.AVAILABLE];
      const wardMaintenance = stats[BedStatus.MAINTENANCE];
      const wardCleaning = stats[BedStatus.CLEANING];

      totalBeds += wardTotal;
      occupiedBeds += wardOccupied;
      availableBeds += wardAvailable;
      maintenanceBeds += wardMaintenance;
      cleaningBeds += wardCleaning;

      return {
        wardId: ward.id,
        wardName: ward.name,
        tier: ward.tier,
        stats: {
          total: wardTotal,
          occupied: wardOccupied,
          available: wardAvailable,
          maintenance: wardMaintenance,
          cleaning: wardCleaning,
          occupancyRate:
            wardTotal > 0
              ? Number(((wardOccupied / wardTotal) * 100).toFixed(2))
              : 0,
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
        cleaningBeds,
        overallOccupancyRate:
          totalBeds > 0
            ? Number(((occupiedBeds / totalBeds) * 100).toFixed(2))
            : 0,
      },
      wards: wardBreakdown,
    };
  }
}
