// src/reports/reports.service.ts

import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExportQueryDto } from './dto/export-query.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { buildCsv, CsvColumn } from './utils/csv-builder.util';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // RESOLVE HOSPITAL — multi-tenant guard
  // ========================================

  /**
   * Determines the hospitalId for the current export request.
   * - HOSPITAL_ADMIN: auto-scoped to their own hospital.
   * - SUPER_ADMIN: must provide hospitalId explicitly.
   */
  private async resolveHospitalId(
    userId: string,
    role: string,
    dto: { hospitalId?: string },
  ): Promise<string> {
    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!hospital) {
        throw new ForbiddenException('Hospital profile not found for user');
      }
      return hospital.id;
    }

    if (role === 'SUPER_ADMIN') {
      if (!dto.hospitalId) {
        throw new BadRequestException(
          'SUPER_ADMIN must provide a hospitalId query parameter to export reports',
        );
      }
      // Verify the hospital exists
      const hospital = await this.prisma.hospital.findUnique({
        where: { id: dto.hospitalId },
        select: { id: true },
      });
      if (!hospital) {
        throw new BadRequestException(
          `Hospital with id "${dto.hospitalId}" not found`,
        );
      }
      return hospital.id;
    }

    throw new ForbiddenException('Access denied');
  }

  // ========================================
  // DATE RANGE HELPER
  // ========================================

  private buildDateFilter(
    from?: string,
    to?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) return undefined;
    return {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }

  // ========================================
  // EXPORT APPOINTMENTS
  // ========================================

  async exportAppointments(
    userId: string,
    role: string,
    dto: ExportQueryDto,
  ): Promise<string> {
    const hospitalId = await this.resolveHospitalId(userId, role, dto);
    const dateFilter = this.buildDateFilter(dto.from, dto.to);

    const where: Record<string, unknown> = { hospitalId };
    if (dateFilter) {
      where.date = dateFilter;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      select: {
        id: true,
        date: true,
        status: true,
        reason: true,
        createdAt: true,
        // PRIVACY: notes, diagnosisSummary, doctorRecommendations are EXCLUDED
        patient: { select: { firstName: true, lastName: true, phone: true } },
        doctor: {
          select: {
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        hospital: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const columns: CsvColumn[] = [
      { header: 'ID', key: 'id' },
      { header: 'Date', key: 'date' },
      { header: 'Status', key: 'status' },
      { header: 'Reason', key: 'reason' },
      { header: 'Patient First Name', key: 'patient.firstName' },
      { header: 'Patient Last Name', key: 'patient.lastName' },
      { header: 'Patient Phone', key: 'patient.phone' },
      { header: 'Doctor First Name', key: 'doctor.firstName' },
      { header: 'Doctor Last Name', key: 'doctor.lastName' },
      { header: 'Specialization', key: 'doctor.specialization' },
      { header: 'Hospital', key: 'hospital.name' },
      { header: 'Created At', key: 'createdAt' },
    ];

    return buildCsv(
      columns,
      appointments as unknown as Record<string, unknown>[],
    );
  }

  // ========================================
  // EXPORT REVENUE (Hospital Invoices)
  // ========================================

  async exportRevenue(
    userId: string,
    role: string,
    dto: ExportQueryDto,
  ): Promise<string> {
    const hospitalId = await this.resolveHospitalId(userId, role, dto);
    const dateFilter = this.buildDateFilter(dto.from, dto.to);

    const where: Record<string, unknown> = { hospitalId };
    if (dateFilter) {
      where.issuedAt = dateFilter;
    }

    const invoices = await this.prisma.hospitalInvoice.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        paymentStatus: true,
        insuranceCovered: true,
        issuedAt: true,
        createdAt: true,
        patient: { select: { firstName: true, lastName: true, phone: true } },
        appointment: { select: { date: true, reason: true } },
        hospital: { select: { name: true } },
        // PRIVACY: no clinical notes or drug-level detail
      },
      orderBy: { issuedAt: 'desc' },
    });

    // Flatten the nested objects for CSV output
    const rows = invoices.map((inv) => ({
      id: inv.id,
      totalAmount: Number(inv.totalAmount),
      paymentStatus: inv.paymentStatus,
      insuranceCovered: inv.insuranceCovered ? 'Yes' : 'No',
      issuedAt: inv.issuedAt,
      createdAt: inv.createdAt,
      patientFirstName: inv.patient.firstName,
      patientLastName: inv.patient.lastName,
      patientPhone: inv.patient.phone,
      appointmentDate: inv.appointment?.date ?? '',
      appointmentReason: inv.appointment?.reason ?? '',
      hospitalName: inv.hospital.name,
    }));

    const columns: CsvColumn[] = [
      { header: 'Invoice ID', key: 'id' },
      { header: 'Total Amount (RWF)', key: 'totalAmount' },
      { header: 'Payment Status', key: 'paymentStatus' },
      { header: 'Insurance Covered', key: 'insuranceCovered' },
      { header: 'Issued At', key: 'issuedAt' },
      { header: 'Patient First Name', key: 'patientFirstName' },
      { header: 'Patient Last Name', key: 'patientLastName' },
      { header: 'Patient Phone', key: 'patientPhone' },
      { header: 'Appointment Date', key: 'appointmentDate' },
      { header: 'Appointment Reason', key: 'appointmentReason' },
      { header: 'Hospital', key: 'hospitalName' },
      { header: 'Created At', key: 'createdAt' },
    ];

    return buildCsv(columns, rows as unknown as Record<string, unknown>[]);
  }

  // ========================================
  // EXPORT PRESCRIPTIONS
  // ========================================

  async exportPrescriptions(
    userId: string,
    role: string,
    dto: ExportQueryDto,
  ): Promise<string> {
    const hospitalId = await this.resolveHospitalId(userId, role, dto);
    const dateFilter = this.buildDateFilter(dto.from, dto.to);

    const where: Record<string, unknown> = { hospitalId };
    if (dateFilter) {
      where.createdAt = dateFilter;
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // PRIVACY: diagnosis, notes, extractedMedications are EXCLUDED
        // PRIVACY: individual medicationName values are EXCLUDED — only count is provided
        patient: { select: { firstName: true, lastName: true, phone: true } },
        doctor: { select: { firstName: true, lastName: true } },
        hospital: { select: { name: true } },
        _count: { select: { prescriptionMedications: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Flatten for CSV
    const rows = prescriptions.map((rx) => ({
      id: rx.id,
      status: rx.status,
      patientFirstName: rx.patient.firstName,
      patientLastName: rx.patient.lastName,
      patientPhone: rx.patient.phone,
      doctorFirstName: rx.doctor?.firstName ?? '',
      doctorLastName: rx.doctor?.lastName ?? '',
      hospitalName: rx.hospital?.name ?? '',
      medicationCount: rx._count.prescriptionMedications,
      createdAt: rx.createdAt,
      updatedAt: rx.updatedAt,
    }));

    const columns: CsvColumn[] = [
      { header: 'Prescription ID', key: 'id' },
      { header: 'Status', key: 'status' },
      { header: 'Patient First Name', key: 'patientFirstName' },
      { header: 'Patient Last Name', key: 'patientLastName' },
      { header: 'Patient Phone', key: 'patientPhone' },
      { header: 'Doctor First Name', key: 'doctorFirstName' },
      { header: 'Doctor Last Name', key: 'doctorLastName' },
      { header: 'Hospital', key: 'hospitalName' },
      { header: 'Medication Count', key: 'medicationCount' },
      { header: 'Created At', key: 'createdAt' },
      { header: 'Updated At', key: 'updatedAt' },
    ];

    return buildCsv(columns, rows as unknown as Record<string, unknown>[]);
  }

  // FINANCIAL AGING (materialized view)

  async getFinancialAging(
    userId: string,
    role: string,
    dto: AnalyticsQueryDto,
  ) {
    const hospitalId = await this.resolveHospitalId(userId, role, dto);

    const rows = await this.prisma.$queryRaw<
      {
        aging_bucket: string;
        claim_count: bigint;
        total_claim_amount: string;
        total_settled_amount: string;
        total_outstanding: string;
      }[]
    >`
      SELECT aging_bucket, claim_count, total_claim_amount, total_settled_amount, total_outstanding
      FROM mv_financial_aging
      WHERE hospital_id = ${hospitalId}
      ORDER BY aging_bucket
    `;

    return rows.map((r) => ({
      agingBucket: r.aging_bucket,
      claimCount: Number(r.claim_count),
      totalClaimAmount: Number(r.total_claim_amount),
      totalSettledAmount: Number(r.total_settled_amount),
      totalOutstanding: Number(r.total_outstanding),
    }));
  }

  // DEPARTMENT METRICS

  async getDepartmentMetrics(
    userId: string,
    role: string,
    dto: AnalyticsQueryDto,
  ) {
    const hospitalId = await this.resolveHospitalId(userId, role, dto);

    const rows = await this.prisma.$queryRaw<
      {
        department: string;
        metric_date: Date;
        patient_throughput: bigint;
        consultation_count: bigint;
        total_revenue: string;
        avg_wait_minutes_approx: string | null;
      }[]
    >`
      SELECT department, metric_date, patient_throughput, consultation_count, total_revenue, avg_wait_minutes_approx
      FROM mv_department_daily_metrics
      WHERE hospital_id = ${hospitalId}
      ORDER BY metric_date DESC, department ASC
    `;

    return rows.map((r) => ({
      department: r.department,
      metricDate: r.metric_date,
      patientThroughput: Number(r.patient_throughput),
      consultationCount: Number(r.consultation_count),
      totalRevenue: Number(r.total_revenue),
      // Approximate: scheduled-time → triage timestamp, not true check-in → seen-by-doctor wait.
      avgWaitMinutesApprox:
        r.avg_wait_minutes_approx !== null
          ? Number(r.avg_wait_minutes_approx)
          : null,
    }));
  }


  /**
   * Generates weekly Ministry of Health statutory disease statistics.
   * Aggregates by Region, Disease Category, Gender, and Age Group.
   */
  async getWeeklyMohStats() {
    this.logger.log('Aggregating weekly MOH statutory statistics...');

    // 1. Define the 7-day window
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // 2. Fetch the raw logs with patient demographics
    const logs = await this.prisma.mohSurveillanceLog.findMany({
      where: {
        reportedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        patient: {
          select: {
            dateOfBirth: true,
            gender: true,
            address: true,
          },
        },
      },
    });

    // 3. Setup our aggregation map
    // Key format: "Region|Disease|Gender|AgeGroup"
    const aggregation = new Map<string, number>();

    logs.forEach((log) => {
      // Safely calculate age
      let ageGroup = 'Unknown';
      if (log.patient.dateOfBirth) {
        const age = endDate.getFullYear() - log.patient.dateOfBirth.getFullYear();
        if (age < 5) ageGroup = '0-4 years';
        else if (age < 15) ageGroup = '5-14 years';
        else if (age < 50) ageGroup = '15-49 years';
        else ageGroup = '50+ years';
      }

      // Default demographics if missing
      const gender = log.patient.gender || 'Unknown';
      const region = log.patient.address 
        ? log.patient.address.split(',')[0].trim() // Assumes address format like "Kigali, Gasabo"
        : 'Unknown Region';

      const disease = log.diseaseCategory;

      // Create a unique composite key for this specific grouping
      const key = `${region}|${disease}|${gender}|${ageGroup}`;
      
      // Increment the count
      const currentCount = aggregation.get(key) || 0;
      aggregation.set(key, currentCount + 1);
    });

    // 4. Format the map back into a clean JSON array for the Excel builder
    const reportData = Array.from(aggregation.entries()).map(([key, count]) => {
      const [region, diseaseCategory, gender, ageGroup] = key.split('|');
      return {
        region,
        diseaseCategory,
        gender,
        ageGroup,
        cases: count,
      };
    });

    // Sort alphabetically by Region, then Disease
    return reportData.sort((a, b) => {
      if (a.region === b.region) {
        return a.diseaseCategory.localeCompare(b.diseaseCategory);
      }
      return a.region.localeCompare(b.region);
    });
  }
}
