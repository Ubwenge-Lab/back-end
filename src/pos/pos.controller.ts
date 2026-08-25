// backend/src/pos/pos.controller.ts

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PosService } from './pos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';

interface RequestWithUser {
  user: { sub: string };
}

@ApiTags('POS')
@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PosController {
  constructor(private posService: PosService) {}

  /**
   * POST /pos/sales
   * Process a walk-in counter sale. Deducts stock and returns receipt.
   */
  @Post('sales')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.BRANCH_MANAGER, Role.NURSE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Process a POS walk-in sale (Uganda) — deducts stock and returns receipt',
  })
  createSale(@Req() req: RequestWithUser, @Body() dto: CreatePosSaleDto) {
    return this.posService.createSale(req.user.sub, dto);
  }

  /**
   * GET /pos/sales
   * List POS sales for the staff member's branch, with optional filters.
   */
  @Get('sales')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.BRANCH_MANAGER, Role.NURSE)
  @ApiOperation({ summary: 'Get POS sales for current branch' })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter by date (YYYY-MM-DD)',
  })
  @ApiQuery({ name: 'paymentMethod', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getSales(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.posService.getSales(req.user.sub, {
      date,
      paymentMethod,
      limit: limit ? +limit : undefined,
      offset: offset ? +offset : undefined,
    });
  }

  /**
   * GET /pos/sales/summary
   * Daily revenue summary for the branch.
   */
  @Get('sales/summary')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.BRANCH_MANAGER, Role.NURSE)
  @ApiOperation({ summary: 'Get daily POS summary for current branch' })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date (YYYY-MM-DD). Defaults to today.',
  })
  getDailySummary(@Req() req: RequestWithUser, @Query('date') date?: string) {
    return this.posService.getDailySummary(req.user.sub, date);
  }

  /**
   * GET /pos/sales/:id
   * Get a specific POS sale with full receipt.
   */
  @Get('sales/:id')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.BRANCH_MANAGER, Role.NURSE)
  @ApiOperation({ summary: 'Get a POS sale by ID' })
  getSaleById(@Param('id') id: string) {
    return this.posService.getSaleById(id);
  }
}
