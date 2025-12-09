// backend/src/orders/orders.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { CreateOrderDto, UpdateOrderStatusDto, CancelOrderDto } from './dto';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Create order (Patient)' })
  create(@Req() req: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.sub, dto);
  }

  @Get('my-orders')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Get patient orders' })
  getMyOrders(@Req() req: any, @Query('status') status?: string) {
    return this.ordersService.findByPatient(req.user.sub, status);
  }

  @Get('pharmacy-orders')
  @Roles(Role.PHARMACY)
  @ApiOperation({ summary: 'Get pharmacy orders' })
  getPharmacyOrders(@Req() req: any, @Query('status') status?: string) {
    return this.ordersService.findByPharmacy(req.user.sub, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  getOrderById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Put(':id/status')
  @Roles(Role.PHARMACY)
  @ApiOperation({ summary: 'Update order status (Pharmacy)' })
  updateStatus(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, req.user.sub, dto);
  }

  @Put(':id/cancel')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Cancel order (Patient)' })
  cancelOrder(@Param('id') id: string, @Req() req: any, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancel(id, req.user.sub, dto);
  }
}