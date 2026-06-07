import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClaimsService } from './claims.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { ClaimsFilterDto } from './dto/claims-filter.dto';
import { ReconcileClaimDto } from './dto/reconcile-claim.dto';
@ApiTags('Admin Claims')
@Controller('admin/claims')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
@ApiBearerAuth()
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}
  @Get()
  @ApiOperation({
    summary:
      'List and filter insurance claims (Hospital Admin gets restricted list, Super Admin gets all)',
  })
  findAll(@Req() req: any, @Query() filter: ClaimsFilterDto) {
    return this.claimsService.findAll(req.user, filter);
  }
  @Patch(':claimId/reconcile')
  @ApiOperation({
    summary:
      'Record insurance company claim settlements and update invoice status atomically',
  })
  reconcile(@Param('claimId') claimId: string, @Body() dto: ReconcileClaimDto) {
    return this.claimsService.reconcile(claimId, dto);
  }
}
