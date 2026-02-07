import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { CreateBranchDto } from './dto';
import { BranchStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class BranchesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly emailService: EmailService,
    ) { }

    async createBranch(hqUserId: string, dto: CreateBranchDto) {
        const pharmacy = await this.prisma.pharmacy.findUnique({
            where: { userId: hqUserId },
            select: { id: true, status: true },
        });
        if (!pharmacy) throw new ForbiddenException('Pharmacy not found');
        if (pharmacy.status !== 'APPROVED') throw new ForbiddenException('Pharmacy must be approved to create branches');

        const existingEmail = await this.prisma.branch.findFirst({
            where: { branchManagerEmail: dto.branchManagerEmail },
        });
        if (existingEmail) throw new ConflictException('Email already assigned to another branch');

        return this.prisma.branch.create({
            data: {
                pharmacyId: pharmacy.id,
                name: dto.name,
                address: dto.address,
                phone: dto.phone,
                latitude: dto.latitude,
                longitude: dto.longitude,
                branchManagerEmail: dto.branchManagerEmail,
                branchStatus: BranchStatus.INVITED,
            },
            select: { id: true, name: true, address: true, branchManagerEmail: true, branchStatus: true, createdAt: true },
        });
    }

    async sendCredentials(branchId: string, hqUserId: string) {
        const branch = await this.validateBranchOwnership(branchId, hqUserId);
        if (branch.managerId) throw new BadRequestException('Credentials already sent');

        const tempPassword = this.generateSecurePassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        const tempPasswordHash = await bcrypt.hash(tempPassword, 12);
        const expiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

        const existingUser = await this.prisma.user.findUnique({ where: { email: branch.branchManagerEmail } });
        if (existingUser) throw new ConflictException('User with this email already exists');

        const user = await this.prisma.user.create({
            data: {
                email: branch.branchManagerEmail,
                password: hashedPassword,
                role: UserRole.BRANCH_MANAGER,
                isVerified: true,
            },
        });

        await this.prisma.branch.update({
            where: { id: branchId },
            data: { managerId: user.id, tempPasswordHash, tempPasswordExpiry: expiry },
        });

        await this.emailService.sendBranchCredentials(
            branch.branchManagerEmail,
            tempPassword,
            branch.pharmacy.name,
        );

        return { message: 'Credentials sent successfully' };
    }

    async resendCredentials(branchId: string, hqUserId: string) {
        const branch = await this.validateBranchOwnership(branchId, hqUserId);
        if (!branch.managerId) throw new BadRequestException('Send credentials first');
        if (branch.branchStatus === BranchStatus.APPROVED) throw new ForbiddenException('Cannot resend for approved branch');

        const tempPassword = this.generateSecurePassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        const tempPasswordHash = await bcrypt.hash(tempPassword, 12);
        const expiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: branch.managerId },
                data: { password: hashedPassword },
            }),
            this.prisma.branch.update({
                where: { id: branchId },
                data: { tempPasswordHash, tempPasswordExpiry: expiry, branchStatus: BranchStatus.INVITED },
            }),
        ]);

        await this.emailService.sendBranchCredentials(
            branch.branchManagerEmail,
            tempPassword,
            branch.pharmacy.name,
        );

        return { message: 'Credentials resent successfully' };
    }

    async getMyBranches(hqUserId: string) {
        const pharmacy = await this.prisma.pharmacy.findUnique({
            where: { userId: hqUserId },
            select: { id: true },
        });
        if (!pharmacy) throw new ForbiddenException('Pharmacy not found');

        return this.prisma.branch.findMany({
            where: { pharmacyId: pharmacy.id },
            select: {
                id: true,
                name: true,
                address: true,
                phone: true,
                branchManagerEmail: true,
                branchStatus: true,
                isActive: true,
                createdAt: true,
                manager: { select: { id: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteBranch(branchId: string, hqUserId: string) {
        const branch = await this.validateBranchOwnership(branchId, hqUserId);
        if (branch.branchStatus === BranchStatus.APPROVED) throw new ForbiddenException('Cannot delete approved branch');

        await this.prisma.$transaction(async (tx) => {
            if (branch.managerId) {
                await tx.user.delete({ where: { id: branch.managerId } });
            }
            await tx.branch.delete({ where: { id: branchId } });
        });

        return { message: 'Branch deleted successfully' };
    }

    private async validateBranchOwnership(branchId: string, hqUserId: string) {
        const pharmacy = await this.prisma.pharmacy.findUnique({
            where: { userId: hqUserId },
            select: { id: true },
        });
        if (!pharmacy) throw new ForbiddenException('Pharmacy not found');

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
            include: { pharmacy: { select: { id: true, name: true } } },
        });
        if (!branch) throw new NotFoundException('Branch not found');
        if (branch.pharmacyId !== pharmacy.id) throw new ForbiddenException('Access denied');

        return branch;
    }

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
