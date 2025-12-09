// backend/src/insurance/insurance.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PatientsService } from '../patients/patients.service';
import { VerifyInsuranceDto } from './dto/verify-insurance.dto';

@Injectable()
export class InsuranceService {
  private readonly insuranceProviders: string[];

  constructor(
    private configService: ConfigService,
    private patientsService: PatientsService,
  ) {
    this.insuranceProviders = (
      this.configService.get('INSURANCE_PROVIDERS') || 'MMI,RSSB,Sanlam,RAMA,Britam,Radiant'
    ).split(',');
  }

  // ========================================
  // VERIFY INSURANCE (MVP - Simple Mock)
  // ========================================

  async verifyInsurance(userId: string, dto: VerifyInsuranceDto) {
    const patient = await this.patientsService.findByUserId(userId);

    // Validate provider
    if (!this.insuranceProviders.includes(dto.provider)) {
      throw new BadRequestException(
        `Invalid insurance provider. Supported: ${this.insuranceProviders.join(', ')}`,
      );
    }

    // Mock verification - In production, integrate with actual insurance APIs
    // For MVP, we'll assume verification is successful if basic data is provided
    const isValid = this.mockInsuranceVerification(dto);

    if (!isValid) {
      throw new BadRequestException('Insurance verification failed. Please check your policy details.');
    }

    // Determine coverage percentage based on provider (mock data)
    const coveragePercentage = this.getCoveragePercentage(dto.provider);

    // Update patient insurance info
    await this.patientsService.updateInsuranceInfo(userId, {
      insuranceProvider: dto.provider,
      insurancePolicy: dto.policyNumber,
      insuranceMemberId: dto.memberId,
      insuranceCoverage: coveragePercentage,
    });

    return {
      verified: true,
      provider: dto.provider,
      policyNumber: dto.policyNumber,
      coveragePercentage,
      message: `Insurance verified. Your coverage is ${coveragePercentage}%`,
    };
  }

  // ========================================
  // CALCULATE CO-PAY
  // ========================================

  calculateCoPay(subtotal: number, coveragePercentage: number) {
    const insuranceCoverage = (subtotal * coveragePercentage) / 100;
    const patientPayment = subtotal - insuranceCoverage;

    return {
      subtotal,
      insuranceCoverage,
      patientPayment,
      coveragePercentage,
    };
  }

  // ========================================
  // GET SUPPORTED PROVIDERS
  // ========================================

  getSupportedProviders() {
    return {
      providers: this.insuranceProviders,
    };
  }

  // ========================================
  // HELPER FUNCTIONS (Mock for MVP)
  // ========================================

  private mockInsuranceVerification(dto: VerifyInsuranceDto): boolean {
    // Simple validation - check if all required fields are provided
    // In production, make actual API calls to insurance providers
    return !!(
      dto.provider &&
      dto.policyNumber &&
      dto.memberId &&
      dto.memberName
    );
  }

  private getCoveragePercentage(provider: string): number {
    // Mock coverage percentages - In production, fetch from insurance API
    const coverageMap: Record<string, number> = {
      MMI: 80,
      RSSB: 85,
      Sanlam: 75,
      RAMA: 80,
      Britam: 80,
      Radiant: 70,
    };

    return coverageMap[provider] || 0;
  }
}