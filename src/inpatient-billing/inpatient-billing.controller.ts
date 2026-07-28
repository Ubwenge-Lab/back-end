import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InpatientBillingService } from './inpatient-billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { LogSupplyDto } from './dto/log-supply.dto';

@ApiTags('Inpatient Billing')
@ApiBearerAuth()
@Controller('inpatient/admissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InpatientBillingController {
  constructor(private readonly inpatientBillingService: InpatientBillingService) {}

  @Post(':id/supplies')
  @Roles(Role.NURSE, Role.DOCTOR, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Log bedside supply consumption for an admission',
    description:
      'Records a consumable or supply item used at the bedside and immediately appends the cost to the admission checkout invoice. If no invoice exists yet, one is created automatically.',
  })
  @ApiParam({ name: 'id', description: 'Inpatient admission ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Supply logged and invoice updated.' })
  @ApiResponse({ status: 404, description: 'Admission not found.' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Nurse, Doctor, or Hospital Admin required.' })
  async logSupplies(@Param('id') id: string, @Body() data: LogSupplyDto, @Req() req: any) {
    return this.inpatientBillingService.logSupplyConsumption(id, data, req.user.sub);
  }

  @Get(':id/checkout-invoice')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  @ApiOperation({
    summary: 'Get the itemised checkout invoice for an admission',
    description:
      'Returns the running invoice for the admission grouped by billing category (BED_FEE, SUPPLIES, MEDICATION, etc.) along with the current total and payment status.',
  })
  @ApiParam({ name: 'id', description: 'Inpatient admission ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Invoice returned.',
    schema: {
      example: {
        invoiceId: 'uuid',
        totalAmount: 45000,
        paymentStatus: 'UNPAID',
        departments: {
          BED_FEE: [{ description: 'Daily Bed Charge - Ward A (Bed 3)', quantity: 1, unitCost: 20000, subtotal: 20000 }],
          SUPPLIES: [{ description: 'Supply: Syringe 10mL', quantity: 2, unitCost: 500, subtotal: 1000 }],
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Invoice not found for this admission.' })
  @ApiResponse({ status: 403, description: 'Insufficient role.' })
  async getInvoice(@Param('id') admissionId: string) {
    return this.inpatientBillingService.getCheckoutInvoice(admissionId);
  }
}
