// backend/src/pharmacies/pharmacies.service.ts
// FIXED VERSION - Added resubmission method for rejected pharmacies

import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class PharmaciesService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // ========================================
  // FIND ALL PHARMACIES
  // ========================================

  async findAll(status?: string) {
    const where = status ? { status: status as any } : {};

    return this.prisma.pharmacy.findMany({
      where,
      include: {
        user: {
          select: { email: true },
        },
        _count: {
          select: { medications: true, orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // FIND PHARMACY BY ID
  // ========================================

  async findById(id: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true },
        },
        medications: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    return pharmacy;
  }

  // ========================================
  // FIND PHARMACY BY USER ID
  // ========================================

  async findByUserId(userId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: {
        _count: {
          select: { medications: true, orders: true },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    return pharmacy;
  }

  // ========================================
  // UPDATE PHARMACY (Internal method)
  // ========================================

  async update(id: string, dto: UpdatePharmacyDto) {
    return this.prisma.pharmacy.update({
      where: { id },
      data: {
        ...dto,
        dateOfIncorporation: dto.dateOfIncorporation 
          ? new Date(dto.dateOfIncorporation) 
          : undefined,
      },
    });
  }

  // ========================================
  // GET PHARMACY PROFILE
  // ========================================

  async getProfile(userId: string) {
    return this.findByUserId(userId);
  }

  // ========================================
  // UPDATE PHARMACY PROFILE (WITH APPROVAL WORKFLOW)
  // ========================================

  async updateProfile(userId: string, dto: UpdatePharmacyDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Only approved pharmacies can update profile
    if (pharmacy.status !== 'APPROVED') {
      throw new ForbiddenException('Only approved pharmacies can update their profile');
    }

    // Critical fields that require admin re-approval
    const criticalFields = [
      'name',
      'representativeName',
      'rdbCertificate',
      'pharmacyLicense',
      'dateOfIncorporation',
    ];

    const hasCriticalChanges = criticalFields.some(field => dto[field] !== undefined);

    if (hasCriticalChanges) {
      // Store pending changes and set status to PENDING for admin review
      const updatedPharmacy = await this.prisma.pharmacy.update({
        where: { id: pharmacy.id },
        data: {
          ...dto,
          dateOfIncorporation: dto.dateOfIncorporation 
            ? new Date(dto.dateOfIncorporation) 
            : undefined,
          status: 'PENDING', // Requires admin re-approval
          rejectionReason: null, // Clear previous rejection reason
        },
      });

      // Notify super admins about the update
      await this.notifySuperAdminsPharmacyUpdate(pharmacy.id, pharmacy.name);

      return {
        message: 'Profile update submitted for admin approval. Critical changes require verification.',
        pharmacy: updatedPharmacy,
        requiresApproval: true,
      };
    } else {
      // Non-critical fields can be updated directly
      const updatedPharmacy = await this.prisma.pharmacy.update({
        where: { id: pharmacy.id },
        data: {
          ...dto,
          dateOfIncorporation: dto.dateOfIncorporation 
            ? new Date(dto.dateOfIncorporation) 
            : undefined,
        },
      });

      return {
        message: 'Profile updated successfully',
        pharmacy: updatedPharmacy,
        requiresApproval: false,
      };
    }
  }

  // ========================================
  // RESUBMIT APPLICATION (FOR REJECTED PHARMACIES) - NEW
  // ========================================

  async resubmitApplication(userId: string, dto: UpdatePharmacyDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Only rejected pharmacies can resubmit
    if (pharmacy.status !== 'REJECTED') {
      throw new ForbiddenException('Only rejected pharmacies can resubmit their application');
    }

    // Update pharmacy with new information and set to PENDING
    const updatedPharmacy = await this.prisma.pharmacy.update({
      where: { id: pharmacy.id },
      data: {
        ...dto,
        dateOfIncorporation: dto.dateOfIncorporation 
          ? new Date(dto.dateOfIncorporation) 
          : undefined,
        status: 'PENDING',
        rejectionReason: null,
        approvedAt: null,
      },
    });

    // Notify super admins about resubmission
    await this.notifySuperAdminsPharmacyResubmission(pharmacy.id, pharmacy.name);

    return {
      message: 'Application resubmitted successfully. Your pharmacy will be reviewed by our admin team.',
      pharmacy: updatedPharmacy,
    };
  }

  // ========================================
  // GET APPROVED PHARMACIES (Public)
  // ========================================

  async getApprovedPharmacies() {
    return this.prisma.pharmacy.findMany({
      where: { status: 'APPROVED' },
      include: {
        _count: {
          select: { medications: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ========================================
  // ADMIN: APPROVE PHARMACY OR PROFILE UPDATE
  // ========================================

  async approvePharmacy(pharmacyId: string, approved: boolean, rejectionReason?: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      include: { user: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    const updatedPharmacy = await this.prisma.pharmacy.update({
      where: { id: pharmacyId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        rejectionReason: approved ? null : rejectionReason,
        approvedAt: approved ? new Date() : null,
      },
    });

    // Send email notification
    await this.emailService.sendPharmacyApproval(
      pharmacy.user.email,
      pharmacy.name,
      approved,
      rejectionReason,
    );

    // Create in-app notification
    await this.prisma.notification.create({
      data: {
        pharmacyId: pharmacy.id,
        type: approved ? 'PHARMACY_APPROVED' : 'PHARMACY_REJECTED',
        title: approved ? 'Application Approved' : 'Application Rejected',
        message: approved
          ? 'Your pharmacy has been approved! You can now access your dashboard.'
          : `Your pharmacy application was rejected. Reason: ${rejectionReason}. Please update your documents and resubmit.`,
      },
    });

    return {
      message: approved 
        ? 'Pharmacy approved successfully' 
        : 'Pharmacy rejected',
      pharmacy: updatedPharmacy,
    };
  }

  // ========================================
  // ADMIN: GET ALL PENDING PHARMACIES
  // ========================================

  async getPendingPharmacies() {
    return this.prisma.pharmacy.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            email: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // ADMIN: GET ALL PHARMACIES
  // ========================================

  async getAllPharmacies(status?: string) {
    const where = status ? { status: status as any } : {};

    return this.prisma.pharmacy.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // NOTIFY SUPER ADMINS ABOUT PHARMACY UPDATE
  // ========================================

  private async notifySuperAdminsPharmacyUpdate(pharmacyId: string, pharmacyName: string) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    for (const admin of superAdmins) {
      await this.prisma.notification.create({
        data: {
          type: 'PHARMACY_APPROVED',
          title: 'Pharmacy Profile Update',
          message: `${pharmacyName} has submitted profile updates for review.`,
        },
      });
    }
  }

  // ========================================
  // NOTIFY SUPER ADMINS ABOUT PHARMACY RESUBMISSION - NEW
  // ========================================

  private async notifySuperAdminsPharmacyResubmission(pharmacyId: string, pharmacyName: string) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    for (const admin of superAdmins) {
      await this.prisma.notification.create({
        data: {
          type: 'PHARMACY_APPROVED',
          title: 'Pharmacy Application Resubmitted',
          message: `${pharmacyName} has resubmitted their application with updated documents for review.`,
        },
      });
    }
  }

  // ========================================
  // CALCULATE DISTANCE (Haversine formula)
  // ========================================

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // ========================================
  // GET DELIVERY FEE BASED ON DISTANCE
  // ========================================

  getDeliveryFee(pharmacyId: string, distance: number): number {
    const defaultZones = [
      { name: 'Zone 1', maxDistance: 5, fee: 1000 },
      { name: 'Zone 2', maxDistance: 10, fee: 2000 },
      { name: 'Zone 3', maxDistance: 15, fee: 3000 },
      { name: 'Zone 4', maxDistance: 999, fee: 5000 },
    ];

    for (const zone of defaultZones) {
      if (distance <= zone.maxDistance) {
        return zone.fee;
      }
    }

    return 5000;
  }
}