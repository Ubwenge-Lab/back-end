import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { InpatientBillingService } from './inpatient-billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 

@Controller('admissions')
@UseGuards(JwtAuthGuard)
export class InpatientBillingController {
  constructor(private readonly inpatientBillingService: InpatientBillingService) {}

  @Post(':id/supplies')
  async logSupplies(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.inpatientBillingService.logSupplyConsumption(id, data, req.user.sub);
  }

  @Get(':id/checkout-invoice')
  async getInvoice(@Param('id') admissionId: string) {
    return this.inpatientBillingService.getCheckoutInvoice(admissionId);
  }
}
