import { Controller, Post, Get, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../common/constants/role.enum';

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
    constructor(private readonly branchesService: BranchesService) { }

    @Post('create')
    @Roles(Role.PHARMACY)
    create(@CurrentUser('sub') userId: string, @Body() dto: CreateBranchDto) {
        return this.branchesService.createBranch(userId, dto);
    }

    @Post(':id/send-credentials')
    @Roles(Role.PHARMACY)
    sendCredentials(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') userId: string) {
        return this.branchesService.sendCredentials(id, userId);
    }

    @Post(':id/resend')
    @Roles(Role.PHARMACY)
    resendCredentials(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') userId: string) {
        return this.branchesService.resendCredentials(id, userId);
    }

    @Get('my-branches')
    @Roles(Role.PHARMACY)
    getMyBranches(@CurrentUser('sub') userId: string) {
        return this.branchesService.getMyBranches(userId);
    }

    @Delete(':id')
    @Roles(Role.PHARMACY)
    delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') userId: string) {
        return this.branchesService.deleteBranch(id, userId);
    }
}
