// backend/src/lab-results/lab-results.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { LabResultsService } from './lab-results.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SpecializationGuard } from '../auth/guards/specialization.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireSpecialization } from '../auth/decorators/specialization.decorator';
import { Role } from '../common/constants/role.enum';
import { TechnicianSpecialization } from '../common/constants/technician-specialization.enum';
import {
  UploadLabResultDto,
  RejectLabOrderDto,
  UpdateLabOrderStatusDto,
  StructuredResultEntryDto,
} from './dto';
import { DiagnosticStatus } from '@prisma/client';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@ApiTags('Lab Results')
@Controller('lab-results')
@UseGuards(JwtAuthGuard, RolesGuard, SpecializationGuard)
@Roles(Role.TECHNICIAN)
@RequireSpecialization(TechnicianSpecialization.LAB)
@ApiBearerAuth()
export class LabResultsController {
  constructor(private readonly labResultsService: LabResultsService) {}

  // 1. View assigned test orders
  @Get('queue')
  @ApiOperation({ summary: 'View the lab technician’s scoped order queue (Lab Technician only)' })
  @ApiQuery({ name: 'status', required: false, enum: DiagnosticStatus })
  getQueue(@Req() req: any, @Query('status') status?: DiagnosticStatus) {
    return this.labResultsService.getQueue(req.user.sub, status);
  }

  // 2, 4, 6. Secure encrypted upload + correction workflow, linked by MRN + appointment ID
  @Post('upload')
  @ApiOperation({
    summary: 'Upload (or correct) an encrypted lab result file, linked by patient MRN + appointment ID',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  uploadResult(
    @Req() req: any,
    @UploadedFile() file: MulterFile,
    @Body() dto: UploadLabResultDto,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.labResultsService.uploadResult(req.user.sub, dto, file);
  }

  // 2. Update specimen/order status through its lifecycle
  @Put('orders/:id/status')
  @ApiOperation({ summary: 'Advance a lab order’s status (PENDING → COLLECTED → IN_PROGRESS)' })
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLabOrderStatusDto) {
    return this.labResultsService.updateStatus(req.user.sub, id, dto);
  }

  // 3. Reject/cancel an order with a mandatory reason
  @Put('orders/:id/reject')
  @ApiOperation({ summary: 'Reject/cancel a lab order with a mandatory reason (notifies the ordering doctor)' })
  rejectOrder(@Req() req: any, @Param('id') id: string, @Body() dto: RejectLabOrderDto) {
    return this.labResultsService.rejectOrder(req.user.sub, id, dto);
  }

  // 5. Structured/discrete result entry
  @Put('orders/:id/structured-result')
  @ApiOperation({ summary: 'Enter structured numeric/discrete lab result values' })
  enterStructuredResult(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: StructuredResultEntryDto,
  ) {
    return this.labResultsService.enterStructuredResult(req.user.sub, id, dto);
  }
}
