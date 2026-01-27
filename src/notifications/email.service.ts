// backend/src/notifications/email.service.ts

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
  
    if (!apiKey) {
      console.warn('⚠️  SENDGRID_API_KEY is not set - emails will not be sent');
      return;
    }
  
    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid initialized');
  }

  // ========================================
  // SEND EMAIL VERIFICATION WITH 5-DIGIT CODE
  // ========================================

  async sendVerificationEmail(email: string, code: string) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      console.warn('⚠️  SendGrid not configured - skipping email');
      return; // Don't throw error in development
    }

    const msg = {
      to: email,
      from: {
        email: this.configService.get('SENDGRID_FROM_EMAIL') || 'danielntwali9@gmail.com',
        name: this.configService.get('SENDGRID_FROM_NAME') || 'Evuze',
      },
      subject: 'Verify Your Evuze Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Welcome to Evuze Healthcare! 🏥</h2>
          <p>Thank you for registering with Evuze. Please verify your email address using the code below:</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <h1 style="color: #667eea; font-size: 36px; letter-spacing: 8px; margin: 0;">${code}</h1>
          </div>
          <p>Enter this code in the verification page to complete your registration.</p>
          <p>This code will expire in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      console.error('❌ SendGrid error:', error.response?.body || error.message);
      
      // Log detailed error for debugging
      if (error.response?.body?.errors) {
        console.error('SendGrid detailed errors:', JSON.stringify(error.response.body.errors, null, 2));
      }
      
      // Don't throw in development to allow registration to complete
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException('Failed to send verification email');
      }
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
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      console.warn('⚠️  SendGrid not configured - skipping email');
      return;
    }

    const msg = {
      to: data.email,
      from: {
        email: this.configService.get('SENDGRID_FROM_EMAIL') || 'danielntwali9@gmail.com',
        name: this.configService.get('SENDGRID_FROM_NAME') || 'Evuze',
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
          <p style="color: #999; font-size: 12px;">Thank you for using Evuze Healthcare.</p>
        </div>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Order notification sent to ${data.email}`);
    } catch (error) {
      console.error('❌ SendGrid error:', error.response?.body || error.message);
    }
  }

  // ========================================
  // SEND PHARMACY APPROVAL
  // ========================================

  async sendPharmacyApproval(email: string, pharmacyName: string, approved: boolean, reason?: string) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      console.warn('⚠️  SendGrid not configured - skipping email');
      return;
    }

    const msg = {
      to: email,
      from: {
        email: this.configService.get('SENDGRID_FROM_EMAIL') || 'danielntwali9@gmail.com',
        name: this.configService.get('SENDGRID_FROM_NAME') || 'Evuze',
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
      console.error('❌ SendGrid error:', error.response?.body || error.message);
    }
  }
}