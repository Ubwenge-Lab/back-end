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
    const name =
      this.configService.get('RESEND_FROM_NAME') || 'Evuze Healthcare';
    const email =
      this.configService.get('RESEND_FROM_EMAIL') || 'noreply@ubwengelab.rw';
    return `${name} <${email}>`;
  }

  private baseTemplate(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Evuze Healthcare</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;">🏥 Evuze Healthcare</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Powered by Ubwenge Lab</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:40px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;">© 2026 Evuze Healthcare · Ubwenge Lab · Kigali, Rwanda</p>
              <p style="margin:0;color:#cbd5e1;font-size:11px;">This is an automated email. Please do not reply directly to this message.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // ========================================
  // 1. EMAIL VERIFICATION
  // ========================================

  async sendVerificationEmail(email: string, code: string) {
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping email');
      return;
    }

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">Verify Your Email Address</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
        Welcome to <strong>Evuze Healthcare</strong>! Use the verification code below to confirm your email and activate your account.
      </p>
      <div style="background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);border-radius:12px;padding:32px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:13px;text-transform:uppercase;letter-spacing:2px;">Your Verification Code</p>
        <h1 style="margin:0;color:#ffffff;font-size:48px;font-weight:800;letter-spacing:12px;">${code}</h1>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:#f0f4ff;border-radius:8px;padding:16px 20px;">
            <p style="margin:0;color:#0d9488;font-size:13px;">⏱️ <strong>This code expires in 24 hours.</strong> Enter it on the verification page to complete your registration.</p>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#999;font-size:13px;">If you didn't create an Evuze account, you can safely ignore this email.</p>
    `);

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: '🔐 Verify Your Evuze Account',
        html,
      });
      console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException(
          'Failed to send verification email',
        );
      }
    }
  }

  // ========================================
  // 2. PASSWORD RESET
  // ========================================

  async sendPasswordResetEmail(email: string, resetCode: string) {
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping email');
      return;
    }

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">Reset Your Password</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
        We received a request to reset the password for your Evuze account. Use the code below to proceed.
      </p>
      <div style="background:#1a1a2e;border-radius:12px;padding:32px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:rgba(255,255,255,0.6);font-size:13px;text-transform:uppercase;letter-spacing:2px;">Password Reset Code</p>
        <h1 style="margin:0;color:#ffffff;font-size:48px;font-weight:800;letter-spacing:12px;">${resetCode}</h1>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:#fff5f5;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;color:#dc2626;font-size:13px;">⏱️ <strong>This code expires in 1 hour.</strong> If you didn't request a reset, please secure your account immediately.</p>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#999;font-size:13px;">If you didn't request a password reset, your password will remain unchanged.</p>
    `);

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: '🔑 Reset Your Evuze Password',
        html,
      });
      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException(
          'Failed to send password reset email',
        );
      }
    }
  }

  // ========================================
  // 3. ORDER NOTIFICATION
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

    const statusColors: Record<string, string> = {
      PENDING: '#f59e0b',
      ACCEPTED: '#3b82f6',
      PREPARING: '#8b5cf6',
      READY: '#10b981',
      DELIVERED: '#10b981',
      COMPLETED: '#10b981',
      CANCELLED: '#ef4444',
    };
    const color = statusColors[data.status.toUpperCase()] || '#667eea';

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">Order Update 📦</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">Hello <strong>${data.name}</strong>, here's the latest update on your order.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;margin:0 0 24px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:20px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Number</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:18px;font-weight:700;">#${data.orderNumber}</p>
          </td>
          <td style="padding:20px 24px;border-bottom:1px solid #e8ecf4;text-align:right;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Status</p>
            <span style="display:inline-block;margin-top:4px;padding:4px 14px;background:${color};color:#fff;border-radius:20px;font-size:13px;font-weight:600;">${data.status}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:20px 24px;">
            <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">${data.message}</p>
          </td>
        </tr>
      </table>
      <a href="${this.configService.get('FRONTEND_URL')}/patient/orders/${data.orderNumber}"
         style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
        View Order Details →
      </a>
      <p style="margin:0;color:#999;font-size:13px;">Thank you for using Evuze Healthcare.</p>
    `);

    try {
      await this.resend.emails.send({
        to: data.email,
        from: this.getFrom(),
        subject: `📦 Order #${data.orderNumber} — ${data.status}`,
        html,
      });
      console.log(`✅ Order notification sent to ${data.email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  // ========================================
  // 4. PHARMACY APPROVAL / REJECTION
  // ========================================

  async sendPharmacyApproval(
    email: string,
    pharmacyName: string,
    approved: boolean,
    reason?: string,
  ) {
    if (!this.resend) return;

    const html = this.baseTemplate(
      approved
        ? `<div style="text-align:center;margin:0 0 28px;">
           <div style="display:inline-block;background:#d1fae5;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;">✅</div>
         </div>
         <h2 style="margin:0 0 8px;color:#065f46;font-size:22px;text-align:center;">Pharmacy Approved!</h2>
         <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;text-align:center;">
           Congratulations! <strong>${pharmacyName}</strong> has been approved on Evuze Healthcare.
         </p>
         <a href="${this.configService.get('FRONTEND_URL')}/login"
            style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
           Go to Dashboard →
         </a>`
        : `<div style="text-align:center;margin:0 0 28px;">
           <div style="display:inline-block;background:#fee2e2;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;">⚠️</div>
         </div>
         <h2 style="margin:0 0 8px;color:#991b1b;font-size:22px;text-align:center;">Application Needs Attention</h2>
         <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;text-align:center;">
           Your pharmacy application for <strong>${pharmacyName}</strong> could not be approved at this time.
         </p>
         ${
           reason
             ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
           <tr><td style="background:#fff5f5;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;">
             <p style="margin:0 0 4px;color:#dc2626;font-size:12px;font-weight:700;text-transform:uppercase;">Reason</p>
             <p style="margin:0;color:#555;font-size:14px;">${reason}</p>
           </td></tr></table>`
             : ''
         }
         <a href="${this.configService.get('FRONTEND_URL')}/login"
            style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
           Update Application →
         </a>`,
    );

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: approved
          ? '✅ Pharmacy Application Approved — Evuze'
          : '⚠️ Pharmacy Application Update — Evuze',
        html,
      });
      console.log(`✅ Pharmacy approval email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  // ========================================
  // 5. PHARMACY PROFILE UPDATE NOTIFICATION
  // ========================================

  async sendPharmacyUpdateNotification(
    email: string,
    pharmacyName: string,
    approved: boolean,
    reason?: string,
  ) {
    if (!this.resend) return;

    const html = this.baseTemplate(
      approved
        ? `<h2 style="margin:0 0 8px;color:#065f46;font-size:22px;">Profile Update Approved ✅</h2>
         <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
           The profile update for <strong>${pharmacyName}</strong> has been approved. Your changes are now live.
         </p>
         <a href="${this.configService.get('FRONTEND_URL')}/pharmacy/profile"
            style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
           View Your Profile →
         </a>`
        : `<h2 style="margin:0 0 8px;color:#991b1b;font-size:22px;">Profile Update Needs Revision</h2>
         <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
           Your profile update for <strong>${pharmacyName}</strong> requires changes before it can go live.
         </p>
         ${
           reason
             ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
           <tr><td style="background:#fff5f5;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;">
             <p style="margin:0 0 4px;color:#dc2626;font-size:12px;font-weight:700;text-transform:uppercase;">Reason</p>
             <p style="margin:0;color:#555;font-size:14px;">${reason}</p>
           </td></tr></table>`
             : ''
         }
         <a href="${this.configService.get('FRONTEND_URL')}/pharmacy/profile"
            style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
           Update Your Profile →
         </a>`,
    );

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: approved
          ? '✅ Profile Update Approved — Evuze'
          : '⚠️ Profile Update Needs Revision — Evuze',
        html,
      });
      console.log(`✅ Pharmacy update notification sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  // ========================================
  // 6. BRANCH MANAGER CREDENTIALS
  // ========================================

  async sendBranchCredentials(
    email: string,
    tempPassword: string,
    pharmacyName: string,
  ) {
    if (!this.resend) {
      console.warn('Resend not configured - skipping email');
      return;
    }

    const loginUrl = `${this.configService.get('FRONTEND_URL')}/login`;
    console.log('==========================================');
    console.log(`📧 EMAILING BRANCH MANAGER: ${email}`);
    console.log(`🔑 TEMP PASSWORD: ${tempPassword}`);
    console.log('==========================================');

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">Branch Manager Account Created 🏪</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
        You have been assigned as a <strong>Branch Manager</strong> for <strong>${pharmacyName}</strong> on Evuze Healthcare.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;margin:0 0 20px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Email</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;">${email}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Temporary Password</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:20px;font-weight:700;font-family:monospace;letter-spacing:2px;">${tempPassword}</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:#fff5f5;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;color:#dc2626;font-size:13px;">🔒 <strong>This temporary password expires in 5 days.</strong> Log in and change it immediately.</p>
          </td>
        </tr>
      </table>
      <a href="${loginUrl}"
         style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
        Log In to Your Account →
      </a>
      <p style="margin:0;color:#999;font-size:13px;">If you did not expect this email, please contact your pharmacy headquarters immediately.</p>
    `);

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: `🏪 Branch Manager Account — ${pharmacyName}`,
        html,
      });
      console.log(`Branch credentials email sent to ${email}`);
    } catch (error) {
      console.error('Resend error:', error.message);
    }
  }

  // ========================================
  // 7A. BRANCH APPROVAL / REJECTION
  // ========================================

  async sendBranchApproval(
    email: string,
    branchName: string,
    approved: boolean,
    reason?: string,
  ) {
    if (!this.resend) return;

    const html = this.baseTemplate(
      approved
        ? `<h2 style="margin:0 0 8px;color:#065f46;font-size:22px;">Branch Approved ✅</h2>
         <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
           Great news! <strong>${branchName}</strong> has been approved and is now active on Evuze Healthcare.
         </p>
         <a href="${this.configService.get('FRONTEND_URL')}/login"
            style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;">
           Go to Dashboard →
         </a>`
        : `<h2 style="margin:0 0 8px;color:#991b1b;font-size:22px;">Branch Application Update</h2>
         <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
           The branch application for <strong>${branchName}</strong> requires attention.
         </p>
         ${
           reason
             ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
           <tr><td style="background:#fff5f5;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;">
             <p style="margin:0 0 4px;color:#dc2626;font-size:12px;font-weight:700;text-transform:uppercase;">Reason</p>
             <p style="margin:0;color:#555;font-size:14px;">${reason}</p>
           </td></tr></table>`
             : ''
         }
         <p style="margin:0;color:#999;font-size:13px;">Please review and address the issues above.</p>`,
    );

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: approved
          ? `✅ Branch Approved — ${branchName}`
          : `⚠️ Branch Application Update — ${branchName}`,
        html,
      });
    } catch (error) {
      console.error('Resend error:', error.message);
    }
  }

  // ========================================
  // 7B. STAFF CREDENTIALS
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
    const roleEmojis: Record<string, string> = {
      PHARMACIST: '💊',
      CASHIER: '💳',
      BRANCH_MANAGER: '🏪',
    };
    const emoji = roleEmojis[role.toUpperCase()] || '👤';

    console.log('==========================================');
    console.log(`📧 EMAILING STAFF MEMBER: ${email}`);
    console.log(`👤 ROLE: ${role}`);
    console.log(`🔑 TEMP PASSWORD: ${tempPassword}`);
    console.log('==========================================');

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">Welcome to ${pharmacyName}! ${emoji}</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
        You have been added as a <strong>${role}</strong> at <strong>${branchName}</strong> on Evuze Healthcare.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;margin:0 0 20px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Email</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;">${email}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Role</p>
            <p style="margin:4px 0 0;color:#667eea;font-size:15px;font-weight:600;">${role}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Temporary Password</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:20px;font-weight:700;font-family:monospace;letter-spacing:2px;">${tempPassword}</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;color:#92400e;font-size:13px;">⚠️ <strong>This temporary password expires in 7 days.</strong> Log in and change it immediately.</p>
          </td>
        </tr>
      </table>
      <a href="${loginUrl}"
         style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 28px;">
        Log In Now →
      </a>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0 0 12px;color:#1a1a2e;font-size:14px;font-weight:700;">First Login Steps:</p>
            <ol style="margin:0;padding:0 0 0 18px;color:#555;font-size:14px;line-height:2;">
              <li>Click "Log In Now" above</li>
              <li>Enter your email and temporary password</li>
              <li>Create a new permanent password when prompted</li>
              <li>Start managing your work on Evuze!</li>
            </ol>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 0;color:#999;font-size:13px;">If you did not expect this email, please contact your branch manager immediately.</p>
    `);

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: `${emoji} Your Staff Account — ${pharmacyName}`,
        html,
      });
      console.log(`✅ Staff credentials email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException(
          'Failed to send staff credentials email',
        );
      }
    }
  }

  // ========================================
  // 8. HOSPITAL STAFF CREDENTIALS
  // ========================================

  async sendHospitalStaffCredentials(
    email: string,
    tempPassword: string,
    hospitalName: string,
    role: string,
  ) {
    const roleLabels: Record<string, string> = {
      DOCTOR: 'Doctor',
      NURSE: 'Nurse',
      RECEPTIONIST: 'Receptionist',
    };
    const roleEmojis: Record<string, string> = {
      DOCTOR: '🩺',
      NURSE: '💉',
      RECEPTIONIST: '🗂️',
    };
    const label = roleLabels[role.toUpperCase()] ?? role;
    const emoji = roleEmojis[role.toUpperCase()] ?? '🏥';

    console.log('==========================================');
    console.log(`📧 HOSPITAL STAFF CREDENTIALS`);
    console.log(`👤 Email:    ${email}`);
    console.log(`🏥 Hospital: ${hospitalName}`);
    console.log(`💼 Role:     ${label}`);
    console.log(`🔑 Password: ${tempPassword}`);
    console.log('==========================================');

    if (!this.resend) {
      console.warn('⚠️  Resend not configured - credentials logged above only');
      return;
    }

    const baseUrl = (
      this.configService.get('FRONTEND_URL') || 'http://localhost:3001'
    ).replace(/\/$/, '');
    const loginUrl = `${baseUrl}/login`;
    const changePasswordUrl = `${baseUrl}/hospital/activate`;
    const html = this.baseTemplate(`
      <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:22px;">Hey, welcome aboard! ${emoji}</h2>
      <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.7;">
        You've been added to <strong>${hospitalName}</strong> as a <strong>${label}</strong> on Evuze Healthcare. We're excited to have you! Here are your login details to get started.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;margin:0 0 24px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Email</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;">${email}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Temporary Password</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:20px;font-weight:700;font-family:monospace;letter-spacing:2px;">${tempPassword}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7;text-align:center;">
        This password is valid for <strong>7 days</strong>. You can either set a permanent one right now, or just log in and do it later from your account settings — totally up to you.
      </p>

      <a href="${changePasswordUrl}"
         style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#0a1628 0%,#0d9488 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 12px;">
        Set My Permanent Password
      </a>
      <a href="${loginUrl}"
         style="display:block;text-align:center;padding:12px 24px;background:#ffffff;color:#0d9488;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;margin:0 0 28px;border:2px solid #0d9488;">
        I'll Do It Later, Log Me In
      </a>

      <p style="margin:0;color:#bbb;font-size:12px;text-align:center;line-height:1.6;">
        Didn't expect this email? Reach out to your hospital admin and they'll sort it out.
      </p>
    `);

    try {
      await this.resend.emails.send({
        to: email,
        from: this.getFrom(),
        subject: `${emoji} Your ${label} Account — ${hospitalName}`,
        html,
      });
      console.log(`✅ Hospital staff credentials email sent to ${email}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw new InternalServerErrorException(
          'Failed to send credentials email',
        );
      }
    }
  }

  // ========================================
  // 9. APPOINTMENT CONFIRMATION
  // ========================================

  async sendAppointmentConfirmation(data: {
    patientEmail: string;
    patientName: string;
    doctorName: string;
    hospitalName: string;
    date: Date;
    reason: string;
  }) {
    const dateStr = data.date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = data.date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    console.log('==========================================');
    console.log(`📅 APPOINTMENT CONFIRMED`);
    console.log(`👤 Patient:  ${data.patientName} (${data.patientEmail})`);
    console.log(`🩺 Doctor:   ${data.doctorName}`);
    console.log(`🏥 Hospital: ${data.hospitalName}`);
    console.log(`🕐 When:     ${dateStr} at ${timeStr}`);
    console.log(`📋 Reason:   ${data.reason}`);
    console.log('==========================================');

    if (!this.resend) {
      console.warn(
        '⚠️  Resend not configured - confirmation logged above only',
      );
      return;
    }

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:22px;">Appointment Confirmed ✅</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">
        Hi <strong>${data.patientName}</strong>, your appointment has been booked. Here are the details:
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;margin:0 0 24px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:14px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Doctor</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;">${data.doctorName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Hospital</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;">${data.hospitalName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Date & Time</p>
            <p style="margin:4px 0 0;color:#0d9488;font-size:16px;font-weight:700;">${dateStr} at ${timeStr}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Reason for Visit</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;">${data.reason}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0;color:#bbb;font-size:12px;text-align:center;line-height:1.6;">
        Need to cancel? Log in to your Evuze account and manage your appointments there.
      </p>
    `);

    try {
      await this.resend.emails.send({
        to: data.patientEmail,
        from: this.getFrom(),
        subject: `✅ Appointment confirmed — ${data.hospitalName}`,
        html,
      });
      console.log(`✅ Appointment confirmation sent to ${data.patientEmail}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }

  // ========================================
  // 10. INVOICE PDF DELIVERY
  // ========================================

  async sendInvoicePdf(data: {
    to: string;
    patientName: string;
    hospitalName: string;
    invoiceId: string;
    totalAmount: number;
    issuedAt: Date;
    invoicePdfBuffer: Buffer;
    receiptPdfBuffer: Buffer;
    prescriptionPdfBuffer: Buffer | null;
  }) {
    if (!this.resend) {
      console.warn('⚠️  Resend not configured - skipping invoice PDF email');
      return;
    }

    const dateStr = data.issuedAt.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formattedTotal = `RWF ${data.totalAmount.toLocaleString('en-RW')}`;

    const html = this.baseTemplate(`
      <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:22px;">Payment Receipt 🧾</h2>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">
        Hi <strong>${data.patientName}</strong>, your payment has been confirmed. Please find your receipt${data.prescriptionPdfBuffer ? ' and prescription sheet' : ''} attached to this email.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;margin:0 0 24px;border:1px solid #e8ecf4;">
        <tr>
          <td style="padding:14px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Hospital</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;">${data.hospitalName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Invoice Reference</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;font-weight:600;font-family:monospace;">${data.invoiceId.slice(0, 8).toUpperCase()}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;border-bottom:1px solid #e8ecf4;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Date</p>
            <p style="margin:4px 0 0;color:#1a1a2e;font-size:15px;">${dateStr}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;">
            <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Total Paid</p>
            <p style="margin:4px 0 0;color:#0d9488;font-size:20px;font-weight:700;">${formattedTotal}</p>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:#f0fdf4;border-left:4px solid #10b981;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;color:#065f46;font-size:13px;">✅ <strong>Payment confirmed.</strong> Your documents are attached as PDF files.</p>
          </td>
        </tr>
      </table>

      <p style="margin:0;color:#bbb;font-size:12px;text-align:center;line-height:1.6;">
        Keep this receipt for your records. For any queries, contact ${data.hospitalName} directly.
      </p>
    `);

    const ref = data.invoiceId.slice(0, 8).toUpperCase();
    const attachments: { filename: string; content: string }[] = [
      {
        filename: `invoice-${ref}.pdf`,
        content: data.invoicePdfBuffer.toString('base64'),
      },
      {
        filename: `receipt-${ref}.pdf`,
        content: data.receiptPdfBuffer.toString('base64'),
      },
    ];

    if (data.prescriptionPdfBuffer) {
      attachments.push({
        filename: `prescription-${ref}.pdf`,
        content: data.prescriptionPdfBuffer.toString('base64'),
      });
    }

    try {
      await this.resend.emails.send({
        to: data.to,
        from: this.getFrom(),
        subject: `🧾 Payment Receipt — ${data.hospitalName}`,
        html,
        attachments,
      });
      console.log(`✅ Invoice PDF email sent to ${data.to}`);
    } catch (error) {
      console.error('❌ Resend error sending invoice PDF:', error.message);
    }
  }

  // ========================================
  // 11. SUPER ADMIN NOTIFICATIONS
  // ========================================

  private getSuperAdminEmail(): string {
    return (
      this.configService.get<string>('SUPER_ADMIN_EMAIL') ||
      'd.ntwali@ubwengelab.rw'
    );
  }

  async sendSuperAdminAlert(
    title: string,
    message: string,
    actionText: string,
    actionUrl: string,
  ) {
    if (!this.resend) return;

    const superAdminEmail = this.getSuperAdminEmail();

    const html = this.baseTemplate(`
      <div style="background:#1e293b;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Super Admin Alert</p>
        <h2 style="margin:0;color:#ffffff;font-size:22px;">${title} 🚨</h2>
      </div>
      <p style="margin:0 0 24px;color:#334155;font-size:16px;line-height:1.6;font-weight:500;">
        ${message}
      </p>
      <a href="${actionUrl}"
         style="display:block;text-align:center;padding:16px 24px;background:linear-gradient(135deg,#0f172a 0%,#334155 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin:0 0 24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        ${actionText} →
      </a>
      <p style="margin:0;color:#94a3b8;font-size:13px;">This alert was automatically generated by the Evuze Platform.</p>
    `);

    try {
      await this.resend.emails.send({
        to: superAdminEmail,
        from: this.getFrom(),
        subject: `[Super Admin] ${title}`,
        html,
      });
      console.log(`✅ Super Admin alert sent to ${superAdminEmail}: ${title}`);
    } catch (error) {
      console.error('❌ Resend error:', error.message);
    }
  }
}
