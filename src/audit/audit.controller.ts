import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AuditService } from "./audit.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Role } from "../common/constants/role.enum"

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN)
export class AuditController {
    constructor(private readonly auditService: AuditService) { }

    @Get('logs')
    @ApiOperation({ summary: 'Retrieve audit logs (SUPER_ADMIN only)' })
    @ApiQuery({ name: 'action', required: false, example: 'LOGIN_SUCCESS' })
    @ApiQuery({ name: 'actorRole', required: false, example: 'PHARMACY' })
    @ApiQuery({ name: 'targetType', required: false, example: 'User' })
    @ApiQuery({ name: 'outcome', required: false, enum: ['SUCCESS', 'FAILURE'] })
    @ApiQuery({ name: 'limit', required: false, example: 50 })
    @ApiQuery({ name: 'offset', required: false, example: 0 })
    async getLogs(
        @Query('action') action?: string,
        @Query('actorRole') actorRole?: string,
        @Query('targetType') targetType?: string,
        @Query('outcome') outcome?: string,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    ) {
        return this.auditService.findMany({
            action,
            actorRole,
            targetType,
            outcome,
            limit,
            offset,
        });
    }
}
