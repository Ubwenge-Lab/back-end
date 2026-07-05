import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // SUPER_ADMIN PLATFORM METRICS
  // ========================================
  async getSuperAdminMetrics() {
    const [
      totalHospitals,
      totalPharmacies,
      activeUsers,
      totalOrders,
      totalConsultations,
      revenueData
    ] = await Promise.all([
      this.prisma.hospital.count(),
      this.prisma.pharmacy.count({ where: { status: 'APPROVED' } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.order.count({ where: { status: 'COMPLETED' } }),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'COMPLETED' },
      }),
    ]);

    return {
      platform: {
        totalHospitals,
        totalApprovedPharmacies: totalPharmacies,
        activeAccounts: activeUsers,
      },
      activity: {
        completedOrders: totalOrders,
        completedConsultations: totalConsultations,
      },
      financials: {
        totalPharmacyRevenue: revenueData._sum.amount || 0,
      },
    };
  }

  // ========================================
  // HOSPITAL METRICS
  // ========================================
  async getHospitalMetrics(hospitalId: string, userId: string, role: string) {
    // Multi-tenant check
    if (role === 'HOSPITAL_ADMIN') {
      const adminHospital = await this.prisma.hospital.findFirst({ where: { userId } });
      if (!adminHospital || adminHospital.id !== hospitalId) {
        throw new ForbiddenException('You can only access analytics for your own hospital');
      }
    }

    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const [
      totalDoctors,
      appointmentsData,
      cancelledAppointments,
      revenueData,
      doctorsData
    ] = await Promise.all([
      this.prisma.doctor.count({ where: { hospitalId } }),
      this.prisma.appointment.count({ where: { hospitalId } }),
      this.prisma.appointment.count({ where: { hospitalId, status: 'CANCELLED' } }),
      this.prisma.hospitalInvoice.aggregate({
        _sum: { totalAmount: true },
        where: { hospitalId, paymentStatus: 'PAID' },
      }),
      this.prisma.doctor.aggregate({
        _avg: { rating: true },
        where: { hospitalId },
      }),
    ]);

    const cancellationRate = appointmentsData > 0 
      ? ((cancelledAppointments / appointmentsData) * 100).toFixed(2) 
      : 0;

    return {
      hospitalName: hospital.name,
      staffing: {
        totalDoctors,
        averageDoctorRating: doctorsData._avg.rating || 0,
      },
      operations: {
        totalAppointments: appointmentsData,
        cancellationRate: `${cancellationRate}%`,
      },
      financials: {
        totalRevenue: revenueData._sum.totalAmount || 0,
      },
    };
  }

  // ========================================
  // DOCTOR METRICS
  // ========================================
  async getDoctorMetrics(doctorId: string, userId: string, role: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    // Multi-tenant check
    if (role === 'DOCTOR' && doctor.userId !== userId) {
      throw new ForbiddenException('You can only access your own analytics');
    }
    if (role === 'HOSPITAL_ADMIN') {
      const adminHospital = await this.prisma.hospital.findFirst({ where: { userId } });
      if (!adminHospital || adminHospital.id !== doctor.hospitalId) {
        throw new ForbiddenException('You can only view doctors within your hospital');
      }
    }

    const [totalPatients, totalPrescriptions, completedConsultations] = await Promise.all([
      // Count unique patients seen by this doctor
      this.prisma.appointment.groupBy({
        by: ['patientId'],
        where: { doctorId },
      }).then(res => res.length),
      this.prisma.prescription.count({ where: { doctorId } }),
      this.prisma.appointment.count({ where: { doctorId, status: 'COMPLETED' } }),
    ]);

    return {
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      reputation: {
        rating: doctor.rating,
      },
      clinicalActivity: {
        totalUniquePatients: totalPatients,
        totalPrescriptionsIssued: totalPrescriptions,
        completedConsultations,
      },
    };
  }

  // ========================================
  // PHARMACY METRICS
  // ========================================
  async getPharmacyMetrics(pharmacyId: string, userId: string, role: string) {
    // Multi-tenant check
    if (role === 'PHARMACY') {
      const adminPharmacy = await this.prisma.pharmacy.findUnique({ where: { userId } });
      if (!adminPharmacy || adminPharmacy.id !== pharmacyId) {
        throw new ForbiddenException('You can only access analytics for your own pharmacy');
      }
    }

    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    // Calculate daily sales for the current day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [dailyOrders, dailyRevenue, allMedications] = await Promise.all([
      this.prisma.order.count({
        where: { pharmacyId, createdAt: { gte: startOfDay }, status: 'COMPLETED' },
      }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { pharmacyId, createdAt: { gte: startOfDay }, status: 'COMPLETED' },
      }),
      this.prisma.medication.findMany({
        where: { pharmacyId },
        select: { id: true, name: true, quantity: true, lowStockThreshold: true, price: true },
      }),
    ]);

    // Compute inventory metrics natively
    let totalInventoryValue = 0;
    const lowStockWarnings = [];

    allMedications.forEach(med => {
      totalInventoryValue += med.quantity * med.price;
      if (med.quantity <= med.lowStockThreshold) {
        lowStockWarnings.push({
          medicationId: med.id,
          name: med.name,
          currentStock: med.quantity,
          threshold: med.lowStockThreshold,
        });
      }
    });

    return {
      pharmacyName: pharmacy.name,
      dailyPerformance: {
        ordersCompletedToday: dailyOrders,
        revenueToday: dailyRevenue._sum.total || 0,
      },
      inventory: {
        totalInventoryValue,
        totalLowStockItems: lowStockWarnings.length,
        warnings: lowStockWarnings,
      },
    };
  }
}