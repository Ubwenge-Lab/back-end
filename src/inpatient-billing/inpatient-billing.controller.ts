import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { InpatientBillingService } from './inpatient-billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { LogSupplyDto } from './dto/log-supply.dto';

@Controller('admissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InpatientBillingController {
  constructor(private readonly inpatientBillingService: InpatientBillingService) {}

  @Post(':id/supplies')
  @Roles(Role.NURSE, Role.DOCTOR, Role.HOSPITAL_ADMIN)
  async logSupplies(@Param('id') id: string, @Body() data: LogSupplyDto, @Req() req: any) {
    return this.inpatientBillingService.logSupplyConsumption(id, data, req.user.sub);
  }

  @Get(':id/checkout-invoice')
  @Roles(Role.DOCTOR, Role.NURSE, Role.HOSPITAL_ADMIN)
  async getInvoice(@Param('id') admissionId: string) {
    return this.inpatientBillingService.getCheckoutInvoice(admissionId);
  }
}
