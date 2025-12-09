// backend/src/notifications/email.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('SENDGRID_API_KEY');
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
  }

  // ========================================
  // SEND EMAIL VERIFICATION
  // ========================================

  async sendVerificationEmail(email: string, token: string) {
    const verificationLink = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${token}`;

    const msg = {
      to: email,
      from: {
        email: this.configService.get('SENDGRID_FROM_EMAIL'),
        name: this.configService.get('SENDGRID_FROM_NAME') || 'E-Vuze Healthcare',
      },
      subject: 'Verify Your E-Vuze Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Welcome to E-Vuze Healthcare! 🏥</h2>
          <p>Thank you for registering with E-Vuze. Please verify your email address by clicking the button below:</p>
          <a href="${verificationLink}" 
             style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Verify Email Address
          </a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all;">${verificationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      console.error('❌ SendGrid error:', error);
    }
  }

  // ========================================
  // SEND ORDER NOTIFICATION
  // ========================================

  async sendOrderNotification(data: {
    email: string;
    name: string;
    orderNumber: string;
    status: string;
    message: string;
  }) {
    const msg = {
      to: data.email,
      from: {
        email: this.configService.get('SENDGRID_FROM_EMAIL'),
        name: this.configService.get('SENDGRID_FROM_NAME') || 'E-Vuze Healthcare',
      },
      subject: `Order ${data.orderNumber} - ${data.status}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Order Update 📦</h2>
          <p>Hello ${data.name},</p>
          <p>${data.message}</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <strong>Order Number:</strong> ${data.orderNumber}<br>
            <strong>Status:</strong> <span style="color: #667eea;">${data.status}</span>
          </div>
          <a href="${this.configService.get('FRONTEND_URL')}/patient/orders/${data.orderNumber}" 
             style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px;">
            View Order Details
          </a>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">Thank you for using E-Vuze Healthcare.</p>
        </div>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Order notification sent to ${data.email}`);
    } catch (error) {
      console.error('❌ SendGrid error:', error);
    }
  }

  // ========================================
  // SEND PHARMACY APPROVAL
  // ========================================

  async sendPharmacyApproval(email: string, pharmacyName: string, approved: boolean, reason?: string) {
    const msg = {
      to: email,
      from: {
        email: this.configService.get('SENDGRID_FROM_EMAIL'),
        name: this.configService.get('SENDGRID_FROM_NAME') || 'E-Vuze Healthcare',
      },
      subject: approved ? 'Pharmacy Application Approved ✅' : 'Pharmacy Application Status',
      html: approved
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Congratulations! 🎉</h2>
            <p>Your pharmacy <strong>${pharmacyName}</strong> has been approved!</p>
            <p>You can now log in to your dashboard and start managing your inventory.</p>
            <a href="${this.configService.get('FRONTEND_URL')}/login" 
               style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Log In to Dashboard
            </a>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">Application Update</h2>
            <p>Your pharmacy application for <strong>${pharmacyName}</strong> requires attention.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            <p>Please review and resubmit your application with the necessary corrections.</p>
          </div>
        `,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Pharmacy approval email sent to ${email}`);
    } catch (error) {
      console.error('❌ SendGrid error:', error);
    }
  }
}
