// backend/src/notifications/email.service.ts

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      console.warn('⚠️  RESEND_API_KEY is not set - emails will not be sent');
      return;
    }

    this.resend = new Resend(apiKey);
    console.log('✅ Resend initialized');
  }

  private getFrom(): string {
    const name = this.configService.get('RESEND_FROM_NAME') || 'Evuze';
    const email = this.configService.get('RESEND_FROM_EMAIL') || 'noreply@evuze.rw';
    return `${name} <${email}>`;
  }

  // ========================================
  // SEND EMAIL VERIFICATION WITH 5-DIGIT CODE
  // ========================================

  async sendVerificationEmail(email: string, code: string) {
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping email');
      return;
    }

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
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
      });
      console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException('Failed to send verification email');
      }
    }
  }

  // ========================================
  // SEND PASSWORD RESET EMAIL
  // ========================================

  async sendPasswordResetEmail(email: string, resetCode: string) {
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping email');
      return;
    }

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: 'Reset Your Evuze Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Password Reset Request 🔐</h2>
            <p>We received a request to reset your password. Use the code below to reset it:</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <h1 style="color: #667eea; font-size: 36px; letter-spacing: 8px; margin: 0;">${resetCode}</h1>
            </div>
            <p>Enter this code along with your new password in the password reset page.</p>
            <p>This code will expire in 1 hour.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          </div>
        `,
      });
      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException('Failed to send password reset email');
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
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping email');
      return;
    }

    try {
      await this.resend.emails.send({
        to: data.email,
        from: this.getFrom(),
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
      });
      console.log(`✅ Order notification sent to ${data.email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  // ========================================
  // SEND PHARMACY APPROVAL
  // ========================================

  async sendPharmacyApproval(email: string, pharmacyName: string, approved: boolean, reason?: string) {
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
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
              <a href="${this.configService.get('FRONTEND_URL')}/login" 
                 style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                Update Application
              </a>
            </div>
          `,
      });
      console.log(`✅ Pharmacy approval email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  // ========================================
  // SEND PHARMACY UPDATE NOTIFICATION
  // ========================================

  async sendPharmacyUpdateNotification(email: string, pharmacyName: string, approved: boolean, reason?: string) {
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: approved ? 'Profile Update Approved ✅' : 'Profile Update Status',
        html: approved
          ? `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10b981;">Profile Update Approved 🎉</h2>
              <p>Your profile updates for <strong>${pharmacyName}</strong> have been approved!</p>
              <p>The changes are now live on your pharmacy profile.</p>
              <a href="${this.configService.get('FRONTEND_URL')}/pharmacy/profile" 
                 style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                View Profile
              </a>
            </div>
          `
          : `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ef4444;">Profile Update Needs Revision</h2>
              <p>Your profile update for <strong>${pharmacyName}</strong> requires attention.</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              <p>Please review the feedback and make the necessary corrections.</p>
              <a href="${this.configService.get('FRONTEND_URL')}/pharmacy/profile" 
                 style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                Update Profile
              </a>
            </div>
          `,
      });
      console.log(`✅ Pharmacy update notification sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  async sendBranchCredentials(email: string, tempPassword: string, pharmacyName: string) {
    if (!this.resend) {
      console.warn('Resend not configured - skipping email');
      return;
    }

    const loginUrl = `${this.configService.get('FRONTEND_URL')}/login`;

    console.log('==========================================');
    console.log(`📧 EMAILING BRANCH MANAGER: ${email}`);
    console.log(`🔑 TEMP PASSWORD: ${tempPassword}`);
    console.log('==========================================');

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: `Branch Manager Account - ${pharmacyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Branch Manager Account Created</h2>
            <p>You have been assigned as a branch manager for <strong>${pharmacyName}</strong>.</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
            </div>
            <p style="color: #ef4444;"><strong>Important:</strong> This password expires in 5 days. Please log in and change it immediately.</p>
            <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Log In Now
            </a>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">If you did not expect this email, please contact your pharmacy headquarters.</p>
          </div>
        `,
      });
      console.log(`Branch credentials email sent to ${email}`);
    } catch (error) {
      console.error('Resend error:', error.message);
    }
  }

  async sendBranchApproval(email: string, branchName: string, approved: boolean, reason?: string) {
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: approved ? `Branch Approved - ${branchName}` : `Branch Application Status - ${branchName}`,
        html: approved
          ? `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10b981;">Branch Approved</h2>
              <p>The branch <strong>${branchName}</strong> has been approved and is now active.</p>
              <a href="${this.configService.get('FRONTEND_URL')}/login" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Log In</a>
            </div>`
          : `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ef4444;">Branch Application Update</h2>
              <p>The branch application for <strong>${branchName}</strong> requires attention.</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              <p>Please review and address the issues.</p>
            </div>`,
      });
    } catch (error) {
      console.error('Resend error:', error.message);
    }
  }

  // ========================================
  // SEND STAFF CREDENTIALS
  // ========================================

  async sendStaffCredentials(
    email: string,
    tempPassword: string,
    pharmacyName: string,
    branchName: string,
    role: string,
  ) {
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping email');
      return;
    }

    const loginUrl = `${this.configService.get('FRONTEND_URL')}/login`;

    console.log('==========================================');
    console.log(`📧 EMAILING STAFF MEMBER: ${email}`);
    console.log(`👤 ROLE: ${role}`);
    console.log(`🔑 TEMP PASSWORD: ${tempPassword}`);
    console.log('==========================================');

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: `Staff Account Created - ${pharmacyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Welcome to ${pharmacyName}! 👋</h2>
            <p>You have been added as a <strong>${role}</strong> at <strong>${branchName}</strong>.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 0 0 10px 0;"><strong>Role:</strong> ${role}</p>
              <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
            </div>

            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;"><strong>⚠️ Important:</strong> This temporary password expires in 7 days. Please log in and change it immediately for security purposes.</p>
            </div>

            <a href="${loginUrl}" 
               style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Log In Now
            </a>

            <h3 style="color: #667eea; margin-top: 30px;">First Login Steps:</h3>
            <ol style="line-height: 1.8;">
              <li>Click the "Log In Now" button above</li>
              <li>Enter your email and temporary password</li>
              <li>You'll be prompted to create a new permanent password</li>
              <li>Start managing orders and inventory!</li>
            </ol>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">If you did not expect this email, please contact your branch manager immediately.</p>
          </div>
        `,
      });
      console.log(`✅ Staff credentials email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException('Failed to send staff credentials email');
      }
    }
  }
}