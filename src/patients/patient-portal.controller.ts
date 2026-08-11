import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import PDFDocument from 'pdfkit';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Patient Portal')
@Controller('patient-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PatientPortalController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('receipts')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary: 'View billing receipts and diagnostic fees (Patient only)',
  })
  getReceipts(@Req() req: any) {
    return this.patientsService.getReceipts(req.user.sub);
  }

  @Get('prescriptions')
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary:
      'List active prescriptions with refill and pharmacy checkout status',
  })
  getPrescriptions(@Req() req: any) {
    return this.patientsService.getActivePrescriptions(req.user.sub);
  }

  @Get('discharge-summaries')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'List available discharge summaries' })
  getDischargeSummaries(@Req() req: any) {
    return this.patientsService.getDischargeSummaries(req.user.sub);
  }

  @Get('discharge-summaries/:admissionId/download')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Download a signed discharge summary as a PDF' })
  @ApiParam({ name: 'admissionId', description: 'InpatientAdmission UUID' })
  async downloadDischargeSummary(
    @Req() req: any,
    @Param('admissionId') admissionId: string,
    @Res() res: Response,
  ) {
    const { patient, admission } =
      await this.patientsService.generateDischargeSummaryPdf(
        req.user.sub,
        admissionId,
      );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="discharge-summary-${admission.id}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(16).text('Discharge Summary', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(admission.hospital.name);
    doc.text(admission.hospital.address ?? '');
    doc.moveDown();

    doc.fontSize(12).text(`Patient: ${patient.firstName} ${patient.lastName}`);
    doc.text(
      `Ward: ${admission.wardName ?? 'N/A'}  Bed: ${admission.bedNumber ?? 'N/A'}`,
    );
    doc.text(`Admitted: ${admission.admittedAt.toDateString()}`);
    doc.text(`Discharged: ${admission.dischargedAt?.toDateString() ?? 'N/A'}`);
    doc.moveDown();

    doc.fontSize(12).text('Reason for Admission:', { underline: true });
    doc.fontSize(10).text(admission.reason);
    doc.moveDown();

    if (admission.notes) {
      doc.fontSize(12).text('Clinical Notes:', { underline: true });
      doc.fontSize(10).text(admission.notes);
      doc.moveDown();
    }

    doc.moveDown();
    doc.fontSize(10).text('Signed:', { continued: false });
    doc.text(
      admission.doctor
        ? `Dr. ${admission.doctor.firstName} ${admission.doctor.lastName} (License #${admission.doctor.licenseNumber})`
        : 'Attending physician',
    );

    doc.end();
  }
}
