// backend/src/payments/flutterwave.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FlutterwaveService {
  private readonly baseUrl = 'https://api.flutterwave.com/v3';
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly encryptionKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.secretKey = this.configService.get('FLUTTERWAVE_SECRET_KEY')!;
    this.publicKey = this.configService.get('FLUTTERWAVE_PUBLIC_KEY')!;
    this.encryptionKey = this.configService.get('FLUTTERWAVE_ENCRYPTION_KEY')!;
  }

  // ========================================
  // INITIALIZE PAYMENT
  // ========================================

  async initializePayment(data: {
    orderId: string;
    amount: number;
    customerEmail: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD';
  }) {
    const payload = {
      tx_ref: `${data.orderId}-${Date.now()}`,
      amount: data.amount,
      currency: 'RWF',
      redirect_url: `${this.configService.get('FRONTEND_URL')}/patient/orders/${data.orderId}`,
      customer: {
        email: data.customerEmail,
        name: data.customerName,
        phonenumber: data.customerPhone,
      },
      customizations: {
        title: 'E-Vuze Pharmacy',
        description: `Payment for Order #${data.orderId}`,
        logo: 'https://your-logo-url.com/logo.png',
      },
      payment_options: this.getPaymentOptions(data.paymentMethod),
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/payments`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `Payment initialization failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ========================================
  // VERIFY PAYMENT
  // ========================================

  async verifyPayment(transactionId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transactions/${transactionId}/verify`,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `Payment verification failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ========================================
  // MOBILE MONEY PAYMENT (MTN/Airtel)
  // ========================================

  async chargeMobileMoney(data: {
    orderId: string;
    amount: number;
    phoneNumber: string;
    provider: 'MTN' | 'AIRTEL';
    customerEmail: string;
    customerName: string;
  }) {
    const payload = {
      tx_ref: `${data.orderId}-${Date.now()}`,
      amount: data.amount,
      currency: 'RWF',
      email: data.customerEmail,
      phone_number: data.phoneNumber,
      fullname: data.customerName,
      network: data.provider === 'MTN' ? 'MTN' : 'AIRTEL',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/charges?type=mobile_money_rwanda`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `Mobile money charge failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ========================================
  // VALIDATE MOBILE MONEY OTP
  // ========================================

  async validateMobileMoneyOTP(data: { otp: string; flw_ref: string }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/validate-charge`,
          {
            otp: data.otp,
            flw_ref: data.flw_ref,
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `OTP validation failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ========================================
  // CARD PAYMENT
  // ========================================

  async chargeCard(data: {
    orderId: string;
    amount: number;
    cardNumber: string;
    cvv: string;
    expiryMonth: string;
    expiryYear: string;
    customerEmail: string;
    customerName: string;
  }) {
    const payload = {
      tx_ref: `${data.orderId}-${Date.now()}`,
      amount: data.amount,
      currency: 'RWF',
      email: data.customerEmail,
      fullname: data.customerName,
      card_number: data.cardNumber,
      cvv: data.cvv,
      expiry_month: data.expiryMonth,
      expiry_year: data.expiryYear,
      enckey: this.encryptionKey,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/charges?type=card`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `Card charge failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ========================================
  // REFUND
  // ========================================

  async refund(transactionId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transactions/${transactionId}/refund`,
          {},
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        `Refund failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  private getPaymentOptions(method: string): string {
    switch (method) {
      case 'MTN_MOMO':
        return 'mobilemoneyrwanda';
      case 'AIRTEL_MONEY':
        return 'mobilemoneyrwanda';
      case 'CARD':
        return 'card';
      default:
        return 'card,mobilemoneyrwanda';
    }
  }
}
