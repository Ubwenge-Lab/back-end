// backend/src/staff/staff.service.ts

import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException, 
  ConflictException,
  BadRequestException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { CreateStaffDto, UpdateStaffDto } from './dto';
import { UserRole } from '@prisma/client';
import { StaffPermission } from '../common/constants/staff-permission.enum';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ========================================
  // CREATE STAFF (By Branch Manager)
  // ========================================

  async createStaff(branchManagerUserId: string, dto: CreateStaffDto) {
    // Verify the requester is a branch manager
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
      include: { pharmacy: { select: { name: true } } },
    });

    if (!branch) {
      throw new ForbiddenException('Only branch managers can create staff');
    }

    if (branch.branchStatus !== 'APPROVED') {
      throw new ForbiddenException('Branch must be approved to create staff');
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Check if national ID already exists (if provided)
    if (dto.nationalId) {
      const existingStaff = await this.prisma.staff.findUnique({
        where: { nationalId: dto.nationalId },
      });

      if (existingStaff) {
        throw new ConflictException('National ID already registered');
      }
    }

    // Generate temporary password
    const tempPassword = this.generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const tempPasswordExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Convert role string to UserRole enum
    const userRole = dto.role.toUpperCase() as UserRole;

    // Create user and staff in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user account
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: userRole,
          isVerified: true, // Staff accounts are auto-verified
        },
      });

      // Create staff profile
      const staff = await tx.staff.create({
        data: {
          userId: user.id,
          branchId: branch.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          nationalId: dto.nationalId,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          status: 'ACTIVE',
          workingHours: dto.workingHours || null,
          tempPasswordHash: hashedPassword,
          tempPasswordExpiry,
        },
        include: {
          user: { select: { email: true, role: true } },
          branch: { select: { name: true } },
        },
      });

      // Store permissions in a separate table
      await tx.staffPermission.create({
        data: {
          staffId: staff.id,
          permissions: dto.permissions,
        },
      });

      return staff;
    });

    // Send credentials email
    let emailSent = false;
    try {
      await this.emailService.sendStaffCredentials(
        dto.email,
        tempPassword,
        branch.pharmacy.name,
        branch.name,
        dto.role,
      );
      emailSent = true;
    } catch (error) {
      console.error('Failed to send staff credentials email:', error);
    }

    return {
      message: emailSent 
        ? 'Staff member created successfully. Credentials sent via email.'
        : 'Staff member created successfully. Warning: Email delivery failed.',
      staff: result,
      emailSent,
    };
  }

  // ========================================
  // GET ALL STAFF IN BRANCH
  // ========================================

  async getStaffInBranch(branchManagerUserId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
    });

    if (!branch) {
      throw new ForbiddenException('Only branch managers can view staff');
    }

    const staff = await this.prisma.staff.findMany({
      where: { branchId: branch.id },
      include: {
        user: { select: { email: true, role: true, isVerified: true } },
        permissions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return staff;
  }

  // ========================================
  // GET STAFF BY ID
  // ========================================

  async getStaffById(branchManagerUserId: string, staffId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
    });

    if (!branch) {
      throw new ForbiddenException('Access denied');
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        user: { select: { email: true, role: true } },
        branch: { select: { name: true } },
        permissions: true,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    if (staff.branchId !== branch.id) {
      throw new ForbiddenException('This staff member belongs to another branch');
    }

    return staff;
  }

  // ========================================
  // UPDATE STAFF
  // ========================================

  async updateStaff(branchManagerUserId: string, staffId: string, dto: UpdateStaffDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
    });

    if (!branch) {
      throw new ForbiddenException('Access denied');
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    if (staff.branchId !== branch.id) {
      throw new ForbiddenException('This staff member belongs to another branch');
    }

    // Update staff and permissions in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      // Update permissions first if provided
      if (dto.permissions) {
        await tx.staffPermission.upsert({
          where: { staffId: staff.id },
          update: { permissions: dto.permissions },
          create: {
            staffId: staff.id,
            permissions: dto.permissions,
          },
        });
      }

      // Then update staff profile and fetch with updated permissions
      const updatedStaff = await tx.staff.update({
        where: { id: staffId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          status: dto.status,
          workingHours: dto.workingHours,
        },
        include: {
          user: { select: { email: true, role: true } },
          permissions: true,
        },
      });

      return updatedStaff;
    });

    return {
      message: 'Staff member updated successfully',
      staff: updated,
    };
  }

  // ========================================
  // DELETE STAFF
  // ========================================

  async deleteStaff(branchManagerUserId: string, staffId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
    });

    if (!branch) {
      throw new ForbiddenException('Access denied');
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    if (staff.branchId !== branch.id) {
      throw new ForbiddenException('This staff member belongs to another branch');
    }

    // Delete user account (cascade will delete staff and permissions via FK)
    await this.prisma.user.delete({
      where: { id: staff.userId },
    });
  }

  // ========================================
  // RESEND CREDENTIALS
  // ========================================

  async resendCredentials(branchManagerUserId: string, staffId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
      include: { pharmacy: { select: { name: true } } },
    });

    if (!branch) {
      throw new ForbiddenException('Access denied');
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        user: { select: { id: true, email: true, role: true } },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    if (staff.branchId !== branch.id) {
      throw new ForbiddenException('This staff member belongs to another branch');
    }

    // Generate new temporary password
    const tempPassword = this.generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const tempPasswordExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Update user password and staff temp password
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: staff.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.staff.update({
        where: { id: staffId },
        data: { 
          tempPasswordHash: hashedPassword, 
          tempPasswordExpiry 
        },
      }),
    ]);

    // Send credentials email
    let emailSent = false;
    try {
      await this.emailService.sendStaffCredentials(
        staff.user.email,
        tempPassword,
        branch.pharmacy.name,
        branch.name,
        staff.user.role.toLowerCase(),
      );
      emailSent = true;
    } catch (error) {
      console.error('Failed to send staff credentials email:', error);
    }

    return {
      message: emailSent 
        ? 'Credentials resent successfully'
        : 'Credentials updated but email delivery failed',
      emailSent,
    };
  }

  // ========================================
  // GET MY PROFILE (For Staff)
  // ========================================

  async getMyProfile(userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      include: {
        user: { select: { email: true, role: true } },
        branch: {
          include: {
            pharmacy: { select: { name: true } },
          },
        },
        permissions: true,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    return staff;
  }

  // ========================================
  // CHECK STAFF PERMISSION (Type-Safe)
  // ========================================

  async hasPermission(userId: string, permission: StaffPermission): Promise<boolean> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      include: { permissions: true },
    });

    if (!staff || !staff.permissions) {
      return false;
    }

    return staff.permissions.permissions.includes(permission);
  }

  // ========================================
  // CHANGE STAFF PASSWORD (First Login)
  // ========================================

  async changeStaffPassword(
    userId: string, 
    dto: { tempPassword: string; newPassword: string; confirmPassword: string }
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const staff = await this.prisma.staff.findUnique({
      where: { userId },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    if (!staff.tempPasswordHash) {
      throw new BadRequestException('No temporary password set');
    }

    const isValid = await bcrypt.compare(dto.tempPassword, staff.tempPasswordHash);
    if (!isValid) {
      throw new BadRequestException('Invalid temporary password');
    }

    if (staff.tempPasswordExpiry && staff.tempPasswordExpiry < new Date()) {
      throw new ForbiddenException('Temporary password expired. Contact your branch manager.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      }),
      this.prisma.staff.update({
        where: { id: staff.id },
        data: { tempPasswordHash: null, tempPasswordExpiry: null },
      }),
    ]);

    return { message: 'Password changed successfully' };
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    const bytes = crypto.randomBytes(12);
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars[bytes[i] % chars.length];
    }
    return password;
  }
}