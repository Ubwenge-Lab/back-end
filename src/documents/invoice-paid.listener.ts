import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  PdfService,
  InvoiceData,
  ReceiptData,
  PrescriptionData,
} from './pdf.service';
import { EmailService } from '../notifications/email.service';
import { InvoicePaidEvent } from './invoice-paid.event';

@Injectable()
export class InvoicePaidListener {
  private readonly logger = new Logger(InvoicePaidListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent('invoice.paid', { async: true })
  async handleInvoicePaid(event: InvoicePaidEvent) {
    try {
      await this.generateAndSendInvoicePdf(event);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to process invoice.paid for ${event.invoiceId}: ${msg}`,
      );
    }
  }

  private async generateAndSendInvoicePdf(event: InvoicePaidEvent) {
    // Load full invoice with all relations needed for the PDF
    const invoice = await this.prisma.hospitalInvoice.findUnique({
      where: { id: event.invoiceId },
      include: {
        items: true,
        patient: true,
        hospital: true,
        appointment: {
          include: {
            prescriptions: {
              include: {
                prescriptionMedications: true,
                doctor: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!invoice) {
      this.logger.warn(
        `Invoice ${event.invoiceId} not found — skipping PDF generation`,
      );
      return;
    }

    // ── Build invoice PDF data ─────────────────────────────────────────────────
    const invoiceData: InvoiceData = {
      invoiceId: invoice.id,
      issuedAt: invoice.issuedAt,
      hospitalName: invoice.hospital.name,
      hospitalAddress: invoice.hospital.address,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      patientPhone: invoice.patient.phone,
      insuranceProvider: invoice.patient.insuranceProvider,
      insuranceCovered: invoice.insuranceCovered,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
        subtotal: Number(item.subtotal),
        category: item.category,
      })),
      totalAmount: Number(invoice.totalAmount),
      paymentStatus: 'PAID',
    };

    const invoicePdfPath =
      await this.pdfService.generateInvoicePdf(invoiceData);

    // ── Build receipt PDF data ────────────────────────────────────────────────
    const receiptData: ReceiptData = {
      receiptRef: invoice.id,
      paidAt: invoice.updatedAt,
      hospitalName: invoice.hospital.name,
      hospitalAddress: invoice.hospital.address,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      patientPhone: invoice.patient.phone,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
      totalAmount: Number(invoice.totalAmount),
      insuranceProvider: invoice.patient.insuranceProvider,
    };

    const receiptPdfPath =
      await this.pdfService.generateReceiptPdf(receiptData);

    // ── Build prescription PDF data (if appointment has a prescription) ────────
    let prescriptionPdfPath: string | null = null;
    const prescription = invoice.appointment?.prescriptions?.[0];

    if (prescription?.doctor) {
      const doctor = prescription.doctor;
      let signatureBase64: string | null = null;

      if (doctor.signatureUrl) {
        // Strip data URI prefix if present
        const idx = doctor.signatureUrl.indexOf(',');
        signatureBase64 =
          idx !== -1 ? doctor.signatureUrl.slice(idx + 1) : doctor.signatureUrl;
      }

      const prescriptionData: PrescriptionData = {
        prescriptionId: prescription.id,
        issuedAt: prescription.createdAt,
        hospitalName: invoice.hospital.name,
        patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
        diagnosis: prescription.diagnosis,
        notes: prescription.notes,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        doctorLicenseNumber: doctor.licenseNumber,
        doctorSpecialization: doctor.specialization,
        signatureBase64,
        medications: prescription.prescriptionMedications.map((m) => ({
          name: m.medicationName,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          quantity: m.quantity,
        })),
      };

      prescriptionPdfPath =
        await this.pdfService.generatePrescriptionPdf(prescriptionData);
    }

    // ── Send email with all three PDFs attached ──────────────────────────────
    const invoicePdfBuffer = this.pdfService.readPdfAsBuffer(invoicePdfPath);
    const receiptPdfBuffer = this.pdfService.readPdfAsBuffer(receiptPdfPath);
    const prescriptionPdfBuffer = prescriptionPdfPath
      ? this.pdfService.readPdfAsBuffer(prescriptionPdfPath)
      : null;

    await this.emailService.sendInvoicePdf({
      to: event.patientEmail,
      patientName: event.patientName,
      hospitalName: invoice.hospital.name,
      invoiceId: invoice.id,
      totalAmount: Number(invoice.totalAmount),
      issuedAt: invoice.issuedAt,
      invoicePdfBuffer,
      receiptPdfBuffer,
      prescriptionPdfBuffer,
    });

    this.logger.log(
      `Invoice, receipt + prescription PDFs emailed to ${event.patientEmail} for invoice ${event.invoiceId}`,
    );
  }
}
