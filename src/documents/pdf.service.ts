import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'generated-docs');

export interface InvoiceData {
  invoiceId: string;
  issuedAt: Date;
  hospitalName: string;
  hospitalAddress: string;
  patientName: string;
  patientPhone: string;
  insuranceProvider?: string | null;
  insuranceCovered: boolean;
  items: {
    description: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
    category?: string | null;
  }[];
  totalAmount: number;
  paymentStatus: string;
}

export interface ReceiptData {
  receiptRef: string;
  paidAt: Date;
  hospitalName: string;
  hospitalAddress: string;
  patientName: string;
  patientPhone: string;
  items: {
    description: string;
    quantity: number;
    subtotal: number;
  }[];
  totalAmount: number;
  paymentMethod?: string | null;
  insuranceProvider?: string | null;
}

export interface PrescriptionData {
  prescriptionId: string;
  issuedAt: Date;
  hospitalName: string;
  patientName: string;
  diagnosis?: string | null;
  notes?: string | null;
  doctorName: string;
  doctorLicenseNumber: string;
  doctorSpecialization: string;
  signatureBase64?: string | null;
  medications: {
    name: string;
    dosage?: string | null;
    frequency?: string | null;
    duration?: string | null;
    quantity: number;
  }[];
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  private ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  // ─── INVOICE PDF ─────────────────────────────────────────────────────────────

  async generateInvoicePdf(data: InvoiceData): Promise<string> {
    this.ensureOutputDir();

    const filename = `invoice-${data.invoiceId}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      this.drawInvoice(doc, data);

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    this.logger.log(`Invoice PDF saved: ${filepath}`);
    return filepath;
  }

  private drawInvoice(doc: PDFKit.PDFDocument, data: InvoiceData) {
    const { width } = doc.page;
    const left = 50;
    const right = width - 50;

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.rect(0, 0, width, 90).fill('#0a1628');

    doc
      .fontSize(22)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(data.hospitalName, left, 25)
      .fontSize(9)
      .font('Helvetica')
      .fillColor('rgba(255,255,255,0.6)')
      .text(data.hospitalAddress, left, 52)
      .fillColor('#0d9488')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('INVOICE', right - 90, 33);

    doc.moveDown(2);

    // ── Invoice meta ────────────────────────────────────────────────────────────
    const metaLabelY = 110;
    const metaValueY = metaLabelY + 14;
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text('INVOICE ID', left, metaLabelY)
      .text('DATE ISSUED', 220, metaLabelY)
      .text('STATUS', 380, metaLabelY);

    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(data.invoiceId.slice(0, 8).toUpperCase(), left, metaValueY)
      .font('Helvetica')
      .text(data.issuedAt.toLocaleDateString('en-GB'), 220, metaValueY)
      .fillColor('#0d9488')
      .font('Helvetica-Bold')
      .text(data.paymentStatus, 380, metaValueY);

    doc.y = metaValueY + 24;

    // ── Divider ─────────────────────────────────────────────────────────────────
    doc.y += 24;
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();
    doc.y += 16;

    // ── From / To ────────────────────────────────────────────────────────────────
    const fromX = left;
    const toX = 300;
    const sectionY = doc.y;

    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text('FROM', fromX, sectionY)
      .text('BILLED TO', toX, sectionY);

    const nameY = sectionY + 14;
    doc
      .fontSize(11)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(data.hospitalName, fromX, nameY)
      .text(data.patientName, toX, nameY);

    const addrY = nameY + 18;
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555555')
      .text(data.hospitalAddress, fromX, addrY, { width: 200 })
      .text(data.patientPhone, toX, addrY);

    doc.y = addrY + 18;

    if (data.insuranceProvider) {
      doc.y += 16;
      doc
        .fontSize(9)
        .fillColor('#0d9488')
        .text(
          `Insurance: ${data.insuranceProvider}${data.insuranceCovered ? ' (covered)' : ''}`,
          toX,
          doc.y,
        );
    }

    // ── Items table ──────────────────────────────────────────────────────────────
    doc.y += 36;
    const tableTop = doc.y;
    const colDesc = left;
    const colQty = 290;
    const colUnit = 360;
    const colSub = 460;

    // Table header
    doc.rect(left, tableTop, right - left, 24).fill('#f0f4f8');

    doc
      .fontSize(9)
      .fillColor('#555555')
      .font('Helvetica-Bold')
      .text('DESCRIPTION', colDesc + 8, tableTop + 8)
      .text('QTY', colQty, tableTop + 8)
      .text('UNIT COST', colUnit, tableTop + 8)
      .text('SUBTOTAL', colSub, tableTop + 8);

    doc.y = tableTop + 28;

    for (const item of data.items) {
      const rowY = doc.y;
      const isEven = data.items.indexOf(item) % 2 === 0;
      if (isEven) {
        doc.rect(left, rowY - 4, right - left, 22).fill('#f8fafc');
      }

      doc
        .fontSize(9)
        .fillColor('#1a1a2e')
        .font('Helvetica')
        .text(item.description, colDesc + 8, rowY, { width: 230 })
        .text(String(item.quantity), colQty, rowY)
        .text(this.formatCurrency(item.unitCost), colUnit, rowY)
        .text(this.formatCurrency(item.subtotal), colSub, rowY);

      doc.y = rowY + 22;
    }

    // ── Total ────────────────────────────────────────────────────────────────────
    doc.y += 8;
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();
    doc.y += 12;

    const totalBoxY = doc.y;
    doc.rect(right - 170, totalBoxY, 170, 34).fill('#0a1628');

    doc
      .fontSize(11)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text('TOTAL', right - 162, totalBoxY + 10)
      .text(this.formatCurrency(data.totalAmount), right - 90, totalBoxY + 10);

    doc.y = totalBoxY + 46;

    // ── Footer ───────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc
      .fontSize(8)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text(
        `© 2026 ${data.hospitalName} · Powered by Evuze · This is an official payment receipt.`,
        left,
        footerY,
        { align: 'center', width: right - left },
      );
  }

  // ─── PAYMENT RECEIPT PDF ─────────────────────────────────────────────────────

  async generateReceiptPdf(data: ReceiptData): Promise<string> {
    this.ensureOutputDir();
    const filename = `receipt-${data.receiptRef}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      this.drawReceipt(doc, data);
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    this.logger.log(`Receipt PDF saved: ${filepath}`);
    return filepath;
  }

  private drawReceipt(doc: PDFKit.PDFDocument, data: ReceiptData) {
    const { width } = doc.page;
    const left = 50;
    const right = width - 50;

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.rect(0, 0, width, 90).fill('#0d9488');

    doc
      .fontSize(22)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(data.hospitalName, left, 25)
      .fontSize(9)
      .font('Helvetica')
      .fillColor('rgba(255,255,255,0.7)')
      .text(data.hospitalAddress, left, 52)
      .fillColor('#ffffff')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('PAYMENT RECEIPT', right - 160, 20);

    // ── PAID badge — below title, right-aligned ──────────────────────────────
    doc.rect(right - 60, 44, 60, 20).fill('#ffffff');
    doc
      .fontSize(10)
      .fillColor('#16a34a')
      .font('Helvetica-Bold')
      .text('PAID', right - 52, 49);

    // ── Receipt meta ────────────────────────────────────────────────────────────
    const metaLabelY = 110;
    const metaValueY = metaLabelY + 14;
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text('RECEIPT REF', left, metaLabelY)
      .text('DATE PAID', 240, metaLabelY)
      .text('BILLED TO', 390, metaLabelY);

    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(data.receiptRef.slice(0, 8).toUpperCase(), left, metaValueY)
      .font('Helvetica')
      .text(
        data.paidAt.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        240,
        metaValueY,
      )
      .text(data.patientName, 390, metaValueY);

    doc.y = metaValueY + 24;

    // ── Divider ─────────────────────────────────────────────────────────────────
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();
    doc.y += 20;

    // ── Amount paid (prominent) ──────────────────────────────────────────────────
    const amountBoxY = doc.y;
    doc.rect(left, amountBoxY, right - left, 60).fill('#f0fdf4');

    doc
      .fontSize(11)
      .fillColor('#16a34a')
      .font('Helvetica')
      .text('TOTAL AMOUNT PAID', left + 16, amountBoxY + 10);

    doc
      .fontSize(28)
      .fillColor('#0a1628')
      .font('Helvetica-Bold')
      .text(this.formatCurrency(data.totalAmount), left + 16, amountBoxY + 26);

    doc.y = amountBoxY + 72;

    // ── Items summary ────────────────────────────────────────────────────────────
    doc.y += 8;
    const tableTop = doc.y;
    doc.rect(left, tableTop, right - left, 22).fill('#f0f4f8');
    doc
      .fontSize(9)
      .fillColor('#555555')
      .font('Helvetica-Bold')
      .text('DESCRIPTION', left + 8, tableTop + 7)
      .text('QTY', 360, tableTop + 7)
      .text('AMOUNT', right - 60, tableTop + 7);

    doc.y = tableTop + 26;
    for (const item of data.items) {
      const rowY = doc.y;
      if (data.items.indexOf(item) % 2 === 0) {
        doc.rect(left, rowY - 3, right - left, 20).fill('#f8fafc');
      }
      doc
        .fontSize(9)
        .fillColor('#1a1a2e')
        .font('Helvetica')
        .text(item.description, left + 8, rowY, { width: 280 })
        .text(String(item.quantity), 360, rowY)
        .text(this.formatCurrency(item.subtotal), right - 60, rowY);
      doc.y = rowY + 20;
    }

    // ── Subtotal / insurance row ─────────────────────────────────────────────────
    doc.y += 10;
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();
    doc.y += 10;

    if (data.paymentMethod) {
      doc
        .fontSize(9)
        .fillColor('#888888')
        .font('Helvetica')
        .text(
          `Payment method: ${data.paymentMethod.replace(/_/g, ' ')}`,
          left,
          doc.y,
        );
      doc.y += 14;
    }

    if (data.insuranceProvider) {
      doc
        .fontSize(9)
        .fillColor('#0d9488')
        .text(`Insurance applied: ${data.insuranceProvider}`, left, doc.y);
      doc.y += 14;
    }

    // ── Footer ───────────────────────────────────────────────────────────────────
    doc.y += 20;
    doc
      .fontSize(8)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text(
        `© 2026 ${data.hospitalName} · Powered by Evuze · Keep this receipt for your records.`,
        left,
        doc.y,
        { align: 'center', width: right - left },
      );
  }

  // ─── PRESCRIPTION PDF ─────────────────────────────────────────────────────────

  async generatePrescriptionPdf(data: PrescriptionData): Promise<string> {
    this.ensureOutputDir();

    const filename = `prescription-${data.prescriptionId}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      this.drawPrescription(doc, data);

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    this.logger.log(`Prescription PDF saved: ${filepath}`);
    return filepath;
  }

  private drawPrescription(doc: PDFKit.PDFDocument, data: PrescriptionData) {
    const { width } = doc.page;
    const left = 50;
    const right = width - 50;

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.rect(0, 0, width, 90).fill('#0d9488');

    doc
      .fontSize(22)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(data.hospitalName, left, 32)
      .fillColor('#ffffff')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('PRESCRIPTION', right - 130, 35);

    // ── Meta ─────────────────────────────────────────────────────────────────────
    const rxLabelY = 110;
    const rxValueY = rxLabelY + 14;
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text('PRESCRIPTION ID', left, rxLabelY)
      .text('DATE', 280, rxLabelY)
      .text('PATIENT', 400, rxLabelY);

    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(data.prescriptionId.slice(0, 8).toUpperCase(), left, rxValueY)
      .font('Helvetica')
      .text(data.issuedAt.toLocaleDateString('en-GB'), 280, rxValueY)
      .text(data.patientName, 400, rxValueY);

    doc.y = rxValueY + 24;

    // ── Divider ─────────────────────────────────────────────────────────────────
    doc.y += 24;
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();
    doc.y += 16;

    // ── Diagnosis ────────────────────────────────────────────────────────────────
    if (data.diagnosis) {
      doc.rect(left, doc.y, right - left, 44).fill('#f0fdf4');

      doc.y += 8;
      doc
        .fontSize(9)
        .fillColor('#065f46')
        .font('Helvetica-Bold')
        .text('DIAGNOSIS', left + 12, doc.y);

      doc.y += 14;
      doc
        .fontSize(10)
        .fillColor('#1a1a2e')
        .font('Helvetica')
        .text(data.diagnosis, left + 12, doc.y, { width: right - left - 24 });

      doc.y += 22;
    }

    // ── Medications table ────────────────────────────────────────────────────────
    doc.y += 12;
    const tableTop = doc.y;
    const colName = left;
    const colDosage = 200;
    const colFreq = 310;
    const colDur = 400;
    const colQty = 490;

    doc.rect(left, tableTop, right - left, 24).fill('#0a1628');

    doc
      .fontSize(9)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text('MEDICATION', colName + 8, tableTop + 8)
      .text('DOSAGE', colDosage, tableTop + 8)
      .text('FREQUENCY', colFreq, tableTop + 8)
      .text('DURATION', colDur, tableTop + 8)
      .text('QTY', colQty, tableTop + 8);

    doc.y = tableTop + 28;

    for (const med of data.medications) {
      const rowY = doc.y;
      const isEven = data.medications.indexOf(med) % 2 === 0;
      if (isEven) {
        doc.rect(left, rowY - 4, right - left, 22).fill('#f8fafc');
      }

      doc
        .fontSize(9)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text(med.name, colName + 8, rowY, { width: 150 })
        .font('Helvetica')
        .text(med.dosage ?? '—', colDosage, rowY, { width: 100 })
        .text(med.frequency ?? '—', colFreq, rowY, { width: 85 })
        .text(med.duration ?? '—', colDur, rowY, { width: 80 })
        .text(String(med.quantity), colQty, rowY);

      doc.y = rowY + 22;
    }

    // ── Notes ────────────────────────────────────────────────────────────────────
    if (data.notes) {
      doc.y += 16;
      doc.rect(left, doc.y, right - left, 50).fill('#fffbeb');

      doc.y += 8;
      doc
        .fontSize(9)
        .fillColor('#92400e')
        .font('Helvetica-Bold')
        .text('CLINICAL NOTES', left + 12, doc.y);

      doc.y += 14;
      doc
        .fontSize(9)
        .fillColor('#555555')
        .font('Helvetica')
        .text(data.notes, left + 12, doc.y, { width: right - left - 24 });
    }

    // ── Doctor signature block ─────────────────────────────────────────────────
    // Need ~120px for signature block + footer; add page if not enough room
    const sigNeeded = 130;
    const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
    if (remaining < sigNeeded) {
      doc.addPage();
    } else {
      doc.y += 24;
    }

    // ── Prescribing doctor card ───────────────────────────────────────────────────
    const cardY = doc.y;
    doc.rect(left, cardY, right - left, 90).fill('#f8fafc');

    doc
      .moveTo(left, cardY)
      .lineTo(right, cardY)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    // Left column: signature above, doctor name + details below
    const sigX = left + 12;
    const sigLineY = cardY + 36;
    if (data.signatureBase64) {
      try {
        const sigBuffer = Buffer.from(data.signatureBase64, 'base64');
        doc.image(sigBuffer, sigX, cardY + 6, { height: 30, fit: [140, 30] });
      } catch {
        doc
          .moveTo(sigX, sigLineY)
          .lineTo(sigX + 160, sigLineY)
          .strokeColor('#aaaaaa')
          .stroke();
      }
    } else {
      doc
        .moveTo(sigX, sigLineY)
        .lineTo(sigX + 160, sigLineY)
        .strokeColor('#aaaaaa')
        .stroke();
    }

    // Doctor details below the signature line
    const nameY = sigLineY + 6;
    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(`Dr. ${data.doctorName}`, sigX, nameY);

    doc
      .fontSize(8)
      .fillColor('#0d9488')
      .font('Helvetica')
      .text(data.doctorSpecialization, sigX, nameY + 13);

    doc
      .fontSize(8)
      .fillColor('#555555')
      .text(`${data.doctorSpecialization} Department`, sigX, nameY + 25);

    doc
      .fontSize(8)
      .fillColor('#888888')
      .text(data.hospitalName, sigX, nameY + 37);

    doc.y = cardY + 92;

    // ── Footer ───────────────────────────────────────────────────────────────────
    doc.y += 8;
    doc
      .fontSize(8)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text(
        `© 2026 ${data.hospitalName} · Powered by Evuze · This prescription is legally binding.`,
        left,
        doc.y,
        { align: 'center', width: right - left },
      );
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private formatCurrency(amount: number): string {
    return `RWF ${amount.toLocaleString('en-RW', { minimumFractionDigits: 0 })}`;
  }

  readPdfAsBuffer(filepath: string): Buffer {
    return fs.readFileSync(filepath);
  }
}
