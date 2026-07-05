// src/referrals/utils/referral-pdf.builder.ts
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'generated-docs');

export interface ReferralExportPayload {
  referralId: string;
  generatedAt: string;
  reason: string;
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth?: Date | null;
    gender?: string | null;
    insuranceProvider?: string | null;
  };
  sourceHospital: { name: string; address: string; phone: string };
  targetHospital: { name: string };
  authorizingDoctor: {
    name: string;
    specialization: string;
    licenseNumber: string;
  };
  clinicalHistory: {
    appointments: Array<{
      date: Date;
      reason: string | null;
      diagnosisSummary: string | null;
      doctorRecommendations: string | null;
      vitals: {
        bloodPressure: string;
        temperature: number;
        heartRate: number;
        oxygenSaturation: number;
      } | null;
    }>;
    prescriptions: Array<{
      diagnosis: string | null;
      notes: string | null;
      issuedAt: Date;
      medications: any[];
    }>;
  };
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

export async function generateReferralPdf(
  data: ReferralExportPayload,
): Promise<string> {
  ensureOutputDir();
  const filename = `referral-${data.referralId}.pdf`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const { width } = doc.page;
    const left = 50;
    const right = width - 50;

    // ── Header ──────────────────────────────────────────────────────────
    doc.rect(0, 0, width, 90).fill('#0a1628');
    doc
      .fontSize(20)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(data.sourceHospital.name, left, 25)
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#cccccc')
      .text(data.sourceHospital.address, left, 50)
      .fillColor('#0d9488')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('PATIENT REFERRAL', right - 180, 33);

    doc.y = 110;
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text('REFERRAL ID', left, doc.y)
      .text('DATE GENERATED', 250, doc.y)
      .text('REFERRED TO', 420, doc.y);

    doc.y += 14;
    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(data.referralId.slice(0, 8).toUpperCase(), left, doc.y)
      .font('Helvetica')
      .text(new Date(data.generatedAt).toLocaleDateString('en-GB'), 250, doc.y)
      .text(data.targetHospital.name, 420, doc.y);

    doc.y += 30;
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.y += 16;

    // ── Patient block ───────────────────────────────────────────────────
    doc.fontSize(9).fillColor('#888888').text('PATIENT', left, doc.y);
    doc.y += 14;
    doc
      .fontSize(11)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(`${data.patient.firstName} ${data.patient.lastName}`, left, doc.y);
    doc.y += 16;
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        `DOB: ${data.patient.dateOfBirth ? new Date(data.patient.dateOfBirth).toLocaleDateString('en-GB') : 'N/A'}   Gender: ${data.patient.gender ?? 'N/A'}   Insurance: ${data.patient.insuranceProvider ?? 'N/A'}`,
        left,
        doc.y,
      );

    doc.y += 28;

    // ── Reason ──────────────────────────────────────────────────────────
    doc.rect(left, doc.y, right - left, 50).fill('#f0fdf4');
    doc.y += 8;
    doc
      .fontSize(9)
      .fillColor('#065f46')
      .font('Helvetica-Bold')
      .text('REASON FOR REFERRAL', left + 12, doc.y);
    doc.y += 14;
    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica')
      .text(data.reason, left + 12, doc.y, { width: right - left - 24 });
    doc.y += 30;

    // ── Authorizing doctor ──────────────────────────────────────────────
    doc.fontSize(9).fillColor('#888888').text('AUTHORIZED BY', left, doc.y);
    doc.y += 14;
    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(data.authorizingDoctor.name, left, doc.y)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        `${data.authorizingDoctor.specialization} · License ${data.authorizingDoctor.licenseNumber}`,
        left,
        doc.y + 14,
      );

    doc.y += 40;
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.y += 16;

    // ── Clinical history — appointments ────────────────────────────────
    doc
      .fontSize(12)
      .fillColor('#0a1628')
      .font('Helvetica-Bold')
      .text('CLINICAL HISTORY (THIS HOSPITAL STAY)', left, doc.y);
    doc.y += 20;

    if (data.clinicalHistory.appointments.length === 0) {
      doc
        .fontSize(9)
        .fillColor('#888888')
        .font('Helvetica')
        .text('No completed appointments on record.', left, doc.y);
      doc.y += 16;
    } else {
      for (const apt of data.clinicalHistory.appointments) {
        const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
        if (remaining < 90) doc.addPage();

        doc.rect(left, doc.y, right - left, 4).fill('#0d9488');
        doc.y += 10;
        doc
          .fontSize(9)
          .fillColor('#888888')
          .font('Helvetica')
          .text(new Date(apt.date).toLocaleDateString('en-GB'), left, doc.y);
        doc.y += 14;
        doc
          .fontSize(10)
          .fillColor('#1a1a2e')
          .font('Helvetica-Bold')
          .text(
            apt.diagnosisSummary || apt.reason || 'No diagnosis summary recorded',
            left,
            doc.y,
            { width: right - left },
          );
        doc.y += 16;
        if (apt.doctorRecommendations) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#555555')
            .text(
              `Recommendations: ${apt.doctorRecommendations}`,
              left,
              doc.y,
              { width: right - left },
            );
          doc.y += 14;
        }
        if (apt.vitals) {
          doc
            .fontSize(8)
            .fillColor('#0d9488')
            .text(
              `Vitals — BP: ${apt.vitals.bloodPressure}, Temp: ${apt.vitals.temperature}°C, HR: ${apt.vitals.heartRate}bpm, SpO2: ${apt.vitals.oxygenSaturation}%`,
              left,
              doc.y,
            );
          doc.y += 14;
        }
        doc.y += 10;
      }
    }

    // ── Prescriptions ───────────────────────────────────────────────────
    doc.y += 10;
    const remaining2 = doc.page.height - doc.page.margins.bottom - doc.y;
    if (remaining2 < 80) doc.addPage();

    doc
      .fontSize(12)
      .fillColor('#0a1628')
      .font('Helvetica-Bold')
      .text('PRESCRIBED MEDICATIONS', left, doc.y);
    doc.y += 20;

    if (data.clinicalHistory.prescriptions.length === 0) {
      doc
        .fontSize(9)
        .fillColor('#888888')
        .font('Helvetica')
        .text('No verified prescriptions on record.', left, doc.y);
      doc.y += 16;
    } else {
      for (const rx of data.clinicalHistory.prescriptions) {
        const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
        if (remaining < 60) doc.addPage();

        doc
          .fontSize(9)
          .fillColor('#888888')
          .font('Helvetica')
          .text(new Date(rx.issuedAt).toLocaleDateString('en-GB'), left, doc.y);
        doc.y += 12;
        doc
          .fontSize(10)
          .fillColor('#1a1a2e')
          .font('Helvetica-Bold')
          .text(rx.diagnosis || 'No diagnosis recorded', left, doc.y);
        doc.y += 14;

        for (const med of rx.medications ?? []) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#555555')
            .text(
              `• ${med.name ?? med.medicationName ?? 'Unnamed medication'} — ${med.dosage ?? ''} ${med.frequency ?? ''}`,
              left + 8,
              doc.y,
            );
          doc.y += 13;
        }
        doc.y += 8;
      }
    }

    // ── Footer ──────────────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc
      .fontSize(8)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text(
        `Generated by Evuze · This document contains confidential medical information intended only for the receiving clinical team.`,
        left,
        footerY,
        { align: 'center', width: right - left },
      );

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return filepath;
}