import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StaffLeaveService } from './staff-leave.service';
import { CreateStaffLeaveDto } from './dto/create-staff-leave.dto';
import { UpdateStaffLeaveStatusDto } from './dto/update-staff-leave-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Staff Leave')
@Controller('staff-leave')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StaffLeaveController {
  constructor(private readonly staffLeaveService: StaffLeaveService) {}

  @Post()
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Staff requests leave for their branch' })
  requestLeave(@Req() req: any, @Body() dto: CreateStaffLeaveDto) {
    return this.staffLeaveService.requestLeave(req.user.sub, dto);
  }

  @Get('my')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Staff lists their own leave requests' })
  listMyLeaves(@Req() req: any) {
    return this.staffLeaveService.listMyLeaves(req.user.sub);
  }

  @Get('branch')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Branch manager lists all leave requests for the branch' })
  listBranchLeaves(@Req() req: any) {
    return this.staffLeaveService.listBranchLeaves(req.user.sub);
  }

  @Patch(':id/status')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Branch manager approves or rejects a PENDING leave request' })
  updateLeaveStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateStaffLeaveStatusDto,
  ) {
    return this.staffLeaveService.updateLeaveStatus(req.user.sub, id, dto);
  }
}
