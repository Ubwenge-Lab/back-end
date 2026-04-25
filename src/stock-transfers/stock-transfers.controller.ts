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
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto, UpdateStockTransferStatusDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Stock Transfers')
@Controller('stock-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Get('branch')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all stock transfers for the branch manager' })
  getBranchTransfers(@Req() req: any) {
    return this.stockTransfersService.getBranchTransfers(req.user.sub);
  }

  @Post()
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Initiate a new stock transfer to another branch' })
  createTransfer(@Req() req: any, @Body() dto: CreateStockTransferDto) {
    return this.stockTransfersService.createTransfer(req.user.sub, dto);
  }

  @Patch(':id/status')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({
    summary:
      'Update status of a stock transfer (e.g. APPROVED, SHIPPED, COMPLETED)',
  })
  updateTransferStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateStockTransferStatusDto,
  ) {
    return this.stockTransfersService.updateTransferStatus(
      req.user.sub,
      id,
      dto,
    );
  }
}
