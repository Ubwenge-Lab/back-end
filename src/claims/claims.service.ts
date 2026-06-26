import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimsFilterDto } from './dto/claims-filter.dto';
import { ReconcileClaimDto } from './dto/reconcile-claim.dto';
import { Role } from '../common/constants/role.enum';
import {
  ClaimStatus,
  HospitalBillingStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: { sub: string; role: string }, filter: ClaimsFilterDto) {
    const whereClause: any = {};

    if (user.role === Role.HOSPITAL_ADMIN) {
      const hospital = await this.prisma.hospital.findUnique({
        where: { userId: user.sub },
      });

      if (!hospital) {
        throw new NotFoundException(
          'Hospital administrator does not have an associated hospital record.',
        );
      }

      whereClause.invoice = {
        hospitalId: hospital.id,
      };
    }

    if (filter.provider) {
      whereClause.provider = {
        equals: filter.provider,
        mode: 'insensitive',
      };
    }

    if (filter.status) {
      whereClause.status = filter.status.toUpperCase() as ClaimStatus;
    }

    return this.prisma.insuranceClaim.findMany({
      where: whereClause,
      include: {
        invoice: {
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
                mrn: true,
                insurancePolicy: true,
                insuranceMemberId: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async reconcile(claimId: string, dto: ReconcileClaimDto) {
    const { settledAmount } = dto;

    if (settledAmount < 0) {
      throw new BadRequestException('Settled amount cannot be negative.');
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.insuranceClaim.findUnique({
        where: { id: claimId },
        include: { invoice: true },
      });

      if (!claim) {
        throw new NotFoundException(
          `Insurance claim with ID "${claimId}" not found.`,
        );
      }

      if (claim.status === ClaimStatus.PAID) {
        throw new BadRequestException(
          'This claim has already been fully reconciled and settled.',
        );
      }

      const claimAmount = Number(claim.claimAmount);
      let nextClaimStatus: ClaimStatus;
      let nextBillingStatus: HospitalBillingStatus;
      let difference = 0;

      if (settledAmount >= claimAmount) {
        nextClaimStatus = ClaimStatus.PAID;
        nextBillingStatus = HospitalBillingStatus.PAID;
        difference = 0;
      } else if (settledAmount === 0) {
        nextClaimStatus = ClaimStatus.REJECTED;
        nextBillingStatus = HospitalBillingStatus.PARTIAL;
        difference = claimAmount;
      } else {
        nextClaimStatus = ClaimStatus.PARTIAL;
        nextBillingStatus = HospitalBillingStatus.PARTIAL;
        difference = claimAmount - settledAmount;
      }

      const updatedClaim = await tx.insuranceClaim.update({
        where: { id: claimId },
        data: {
          settledAmount,
          difference,
          status: nextClaimStatus,
        },
      });

      await tx.hospitalInvoice.update({
        where: { id: claim.invoiceId },
        data: {
          paymentStatus: nextBillingStatus,
        },
      });

      return {
        success: true,
        message:
          nextClaimStatus === ClaimStatus.PARTIAL
            ? `Claim reconciled. Underpayment detected: ${difference} RWF logged.`
            : 'Claim successfully reconciled and fully paid.',
        claim: updatedClaim,
        invoiceBillingStatus: nextBillingStatus,
      };
    });
  }
}
