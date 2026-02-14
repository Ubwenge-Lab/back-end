import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Request,
  Query,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { ApproveTransferDto } from './dto/approve-transfer.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { CompleteTransferDto } from './dto/complee-transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../common/constants/role.enum';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  // ==================== BRANCH ENDPOINTS ====================

  @Post('create')
  @Roles(Role.PHARMACY)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateBranchDto) {
    return this.branchesService.createBranch(userId, dto);
  }

  @Post(':id/send-credentials')
  @Roles(Role.PHARMACY)
  sendCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.branchesService.sendCredentials(id, userId);
  }

  @Post(':id/resend')
  @Roles(Role.PHARMACY)
  resendCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.branchesService.resendCredentials(id, userId);
  }

  @Get('my-branches')
  @Roles(Role.PHARMACY)
  getMyBranches(@CurrentUser('sub') userId: string) {
    return this.branchesService.getMyBranches(userId);
  }

  @Delete(':id')
  @Roles(Role.PHARMACY)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.branchesService.deleteBranch(id, userId);
  }

  // ==================== STOCK TRANSFER ENDPOINTS ====================

  @Get('transfer/dropdown')
  getBranchesForTransferDropdown(@CurrentUser('sub') userId: string) {
    return this.branchesService.getBranchesForTransferDropdown(userId);
  }

  @Post('stock-transfer/create')
  createStockTransfer(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateStockTransferDto,
  ) {
    return this.branchesService.createStockTransfer(userId, dto);
  }

  @Patch('stock-transfer/:id/approve')
  approveStockTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: ApproveTransferDto,
  ) {
    return this.branchesService.approveStockTransfer(userId, id, dto);
  }

  @Patch('stock-transfer/:id/reject')
  rejectStockTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: RejectTransferDto,
  ) {
    return this.branchesService.rejectStockTransfer(userId, id, dto);
  }

  @Patch('stock-transfer/:id/complete')
  completeStockTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CompleteTransferDto,
  ) {
    return this.branchesService.completeStockTransfer(userId, id, dto);
  }

  @Patch('stock-transfer/:id/cancel')
  cancelStockTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Query('reason') reason?: string,
  ) {
    return this.branchesService.cancelStockTransfer(userId, id, reason);
  }

  @Get('stock-transfers')
  getStockTransfers(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.branchesService.getStockTransfers(userId, status, branchId);
  }

  @Get('stock-transfer/:id')
  getStockTransferById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.branchesService.getStockTransferById(userId, id);
  }

  @Get('transfer-statistics')
  getTransferStatistics(
    @CurrentUser('sub') userId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.branchesService.getTransferStatistics(userId, branchId);
  }
}
