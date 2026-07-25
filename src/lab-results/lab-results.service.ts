// backend/src/lab-results/lab-results.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { encryptNonDeterministic, decryptDeterministic } from '../common/utils/encryption.util';
import { isValidLabResultFile } from '../common/utils/file-signature.util';
import {
  UploadLabResultDto,
  RejectLabOrderDto,
  UpdateLabOrderStatusDto,
  StructuredResultEntryDto,
} from './dto';
import { DiagnosticStatus, DiagnosticType, NotificationType, TechnicianSpecialization } from '@prisma/client';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const LAB_TEST_TYPES: DiagnosticType[] = [DiagnosticType.BLOOD, DiagnosticType.URINE];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const STATUS_TRANSITIONS: Record<string, DiagnosticStatus> = {
  [DiagnosticStatus.PENDING]: DiagnosticStatus.COLLECTED,
  [DiagnosticStatus.COLLECTED]: DiagnosticStatus.IN_PROGRESS,
};

@Injectable()
export class LabResultsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditService: AuditService,
  ) {}

  // Resolves the calling technician's hospital + confirms they are a LAB technician.
  private async getLabTechnicianContext(userSubId: string) {
    const staff = await this.prisma.hospitalStaff.findUnique({
      where: { userId: userSubId },
    });
    if (!staff) {
      throw new ForbiddenException('Lab technician profile not found');
    }
    if (staff.technicianSpecialization !== TechnicianSpecialization.LAB) {
      throw new ForbiddenException('This account is not registered as a Lab Technician');
    }
    return staff;
  }

  private async findOrderOwnedByHospital(orderId: string, hospitalId: string) {
    const order = await this.prisma.diagnosticOrder.findUnique({
      where: { id: orderId },
      include: { patient: true, doctor: true },
    });
    if (!order || !LAB_TEST_TYPES.includes(order.testType)) {
      throw new NotFoundException('Lab order not found');
    }
    if (order.doctor.hospitalId !== hospitalId) {
      throw new ForbiddenException('This lab order does not belong to your hospital');
    }
    return order;
  }

  // 1. View assigned test orders — scoped to lab tests + the technician's own hospital,
  // returning only MRN, patient name, appointment ID, ordering doctor, and test type.
  async getQueue(userSubId: string, status?: DiagnosticStatus) {
    const staff = await this.getLabTechnicianContext(userSubId);

    const orders = await this.prisma.diagnosticOrder.findMany({
      where: {
        testType: { in: LAB_TEST_TYPES },
        doctor: { hospitalId: staff.hospitalId },
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        testType: true,
        status: true,
        createdAt: true,
        completedAt: true,
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        doctor: {
          select: { firstName: true, lastName: true },
        },
        appointment: {
          select: { id: true, date: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // The Prisma clinical-field encryption extension only auto-decrypts when the
    // root queried model is itself clinical; DiagnosticOrder isn't, so nested
    // patient.mrn comes back as ciphertext — decrypt it explicitly here.
    return orders.map((order) => ({
      ...order,
      patient: order.patient
        ? { ...order.patient, mrn: order.patient.mrn ? decryptDeterministic(order.patient.mrn) : order.patient.mrn }
        : order.patient,
    }));
  }

  // 2 & 4 & 6. Upload (or correct) a lab result file, linked by MRN + appointment ID.
  async uploadResult(userSubId: string, dto: UploadLabResultDto, file: MulterFile) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 10MB limit`,
      );
    }
    if (!isValidLabResultFile(file.mimetype, file.buffer)) {
      throw new BadRequestException(
        'Invalid file: only JPG, PNG, and PDF files are accepted, and file content must match its declared type',
      );
    }

    const staff = await this.getLabTechnicianContext(userSubId);

    const patient = await this.prisma.patient.findFirst({ where: { mrn: dto.mrn } });
    if (!patient) {
      throw new NotFoundException('No patient found for this MRN');
    }

    const order = await this.prisma.diagnosticOrder.findFirst({
      where: {
        patientId: patient.id,
        appointmentId: dto.appointmentId,
        testType: dto.testType ? dto.testType : { in: LAB_TEST_TYPES },
      },
      include: { patient: true, doctor: true },
    });
    if (!order) {
      throw new NotFoundException(
        'No lab order found for this patient and appointment — the doctor must request the test first',
      );
    }
    if (order.doctor.hospitalId !== staff.hospitalId) {
      throw new ForbiddenException('This lab order does not belong to your hospital');
    }
    if (order.status === DiagnosticStatus.REJECTED) {
      throw new BadRequestException('This lab order was rejected and cannot receive results');
    }

    const isCorrection = !!order.fileUrl;
    if (isCorrection && !dto.correctionReason) {
      throw new BadRequestException(
        'correctionReason is required when re-uploading a result for an order that already has one',
      );
    }

    const encryptedDataUri = encryptNonDeterministic(
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
    );

    if (isCorrection) {
      await this.prisma.labResultRevision.create({
        data: {
          diagnosticOrderId: order.id,
          fileUrl: order.fileUrl,
          fileName: order.fileName,
          fileType: order.fileType,
          findings: order.findings,
          resultValue: order.resultValue,
          structuredResult: order.structuredResult ?? undefined,
          correctedById: userSubId,
          correctionReason: dto.correctionReason as string,
        },
      });
    }

    const updatedOrder = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: {
        fileUrl: encryptedDataUri,
        fileName: file.originalname,
        fileType: file.mimetype,
        status: DiagnosticStatus.COMPLETED,
        completedAt: new Date(),
        technicianId: userSubId,
      },
      include: { patient: true, doctor: true },
    });

    await this.auditService.log({
      actorId: userSubId,
      actorRole: 'TECHNICIAN',
      action: isCorrection ? 'LAB_RESULT_CORRECTED' : 'LAB_RESULT_UPLOAD',
      targetType: 'DiagnosticOrder',
      targetId: order.id,
      metadata: { fileName: file.originalname, fileType: file.mimetype },
    });

    await this.notificationsService.create({
      userId: order.doctor.userId,
      type: NotificationType.LAB_RESULT_READY,
      title: 'Lab Result Ready',
      message: `Lab results for ${order.testType} are ready for patient ${order.patient.firstName} ${order.patient.lastName}.`,
    });
    await this.notificationsService.create({
      userId: order.patient.userId,
      type: NotificationType.LAB_RESULT_READY,
      title: 'Your Lab Results Are Ready',
      message: `Your ${order.testType.toLowerCase()} test results are now available.`,
    });

    return {
      id: updatedOrder.id,
      status: updatedOrder.status,
      fileName: updatedOrder.fileName,
      fileType: updatedOrder.fileType,
      completedAt: updatedOrder.completedAt,
      isCorrection,
    };
  }

  // 2. Update specimen/order status through its lifecycle.
  async updateStatus(userSubId: string, orderId: string, dto: UpdateLabOrderStatusDto) {
    const staff = await this.getLabTechnicianContext(userSubId);
    const order = await this.findOrderOwnedByHospital(orderId, staff.hospitalId);

    const expectedNext = STATUS_TRANSITIONS[order.status];
    if (expectedNext !== dto.status) {
      throw new BadRequestException(
        `Cannot move order from ${order.status} to ${dto.status}`,
      );
    }

    const updated = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: { status: dto.status, technicianId: userSubId },
    });

    await this.auditService.log({
      actorId: userSubId,
      actorRole: 'TECHNICIAN',
      action: 'LAB_ORDER_STATUS_CHANGE',
      targetType: 'DiagnosticOrder',
      targetId: order.id,
      metadata: { from: order.status, to: dto.status },
    });

    return updated;
  }

  // 3. Reject/cancel an order with a mandatory reason — notifies the ordering doctor.
  async rejectOrder(userSubId: string, orderId: string, dto: RejectLabOrderDto) {
    const staff = await this.getLabTechnicianContext(userSubId);
    const order = await this.findOrderOwnedByHospital(orderId, staff.hospitalId);

    if (order.status === DiagnosticStatus.COMPLETED || order.status === DiagnosticStatus.REJECTED) {
      throw new BadRequestException(`Cannot reject an order that is already ${order.status}`);
    }

    const updated = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: {
        status: DiagnosticStatus.REJECTED,
        rejectedById: userSubId,
        rejectionReason: dto.reason,
        rejectedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorId: userSubId,
      actorRole: 'TECHNICIAN',
      action: 'LAB_ORDER_REJECTED',
      targetType: 'DiagnosticOrder',
      targetId: order.id,
      metadata: { reason: dto.reason },
    });

    await this.notificationsService.create({
      userId: order.doctor.userId,
      type: NotificationType.LAB_ORDER_REJECTED,
      title: 'Lab Order Rejected',
      message: `The lab order (${order.testType}) for patient ${order.patient.firstName} ${order.patient.lastName} was rejected: ${dto.reason}`,
    });

    return updated;
  }

  // 5. Structured/discrete result entry, independent of (or alongside) a file upload.
  async enterStructuredResult(userSubId: string, orderId: string, dto: StructuredResultEntryDto) {
    const staff = await this.getLabTechnicianContext(userSubId);
    const order = await this.findOrderOwnedByHospital(orderId, staff.hospitalId);

    if (order.status === DiagnosticStatus.REJECTED) {
      throw new BadRequestException('Cannot enter results for a rejected order');
    }

    const updated = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: {
        structuredResult: dto.results as any,
        technicianId: userSubId,
      },
    });

    await this.auditService.log({
      actorId: userSubId,
      actorRole: 'TECHNICIAN',
      action: 'LAB_STRUCTURED_RESULT_ENTRY',
      targetType: 'DiagnosticOrder',
      targetId: order.id,
      metadata: { parameterCount: dto.results.length },
    });

    return updated;
  }
}
