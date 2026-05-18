import {
  Controller,
  Get,
  Patch,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':id')
  @Roles(Role.PATIENT, Role.HOSPITAL_ADMIN, Role.RECEPTIONIST, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get a single invoice (patient can view their own)' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.invoicesService.findOne(id, req.user.sub, req.user.role);
  }

  @Patch(':id/pay')
  @Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark invoice as PAID (Receptionist / Hospital Admin only)' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  pay(@Req() req: any, @Param('id') id: string) {
    return this.invoicesService.pay(id, req.user.sub, req.user.role);
  }
}
