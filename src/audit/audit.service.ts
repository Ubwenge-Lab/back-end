import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { getCorrelationId } from "../logger/correlation.storage";
import { DiscordService } from "../notifications/discord.service";
export interface WriteAuditParams {
    actorId?: string;
    actorRole?: string;
    actorEmail?: string;
    action: string;
    targetType: string;
    targetId?: string;
    outcome?: 'SUCCESS' | 'FAILURE';
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name)

    constructor(private readonly prisma: PrismaService, private readonly discord: DiscordService) { }

    async log(params: WriteAuditParams): Promise<void> {
        const correlationId = getCorrelationId() || undefined

        try {
            await this.prisma.auditLog.create({
                data: {
                    actorId: params.actorId,
                    actorRole: params.actorRole,
                    actorEmail: params.actorEmail,
                    targetId: params.targetId,
                    targetType: params.targetType,
                    action: params.action,
                    outcome: params.outcome ?? 'SUCCESS',
                    ip: params.ip,
                    userAgent: params.userAgent,
                    correlationId: correlationId,
                    metadata: params.metadata as any ?? {},
                },
            })
            if (params.outcome === 'FAILURE') {
                void this.discord.sendAlert(`🚨 Security Alert: ${params.action}`, `A critical action failed.`, 0xff0000, [
                    { name: 'Actor Email', value: params.actorEmail || 'Unknown', inline: true },
                    { name: 'Reason', value: JSON.stringify(params.metadata) || 'No reason provided' }
                ])
            }
        } catch (error) {
            this.logger.error(`AuditService: failed to write log [action=${params.action}]`, error instanceof Error ? error.stack : String(error),)
        }
    }

    async deleteOldLogs(cutoffDate: Date): Promise<number> {
        try {
            const { count } = await this.prisma.auditLog.deleteMany({
                where: {
                    createdAt: {
                        lt: cutoffDate,
                    }
                }
            })
            if (count > 0) {
                this.logger.log(`AuditService: Successfully deleted ${count} old audit logs.`)
            }
            return count
        } catch (error) {
            this.logger.error('AuditService: failed to delete old logs', error instanceof Error ? error.stack : String(error));
            return 0
        }
    }

    async findMany(filters: {
        action?: string;
        actorRole?: string;
        targetType?: string;
        outcome?: string;
        limit?: number;
        offset?: number;
    }) {
        const { action, actorRole, targetType, outcome, limit = 50, offset = 0 } = filters;

        const where: Record<string, unknown> = {}
        if (action) where.action = action;
        if (actorRole) where.actorRole = actorRole;
        if (targetType) where.targetType = targetType;
        if (outcome) where.outcome = outcome;

        const [items, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: Math.min(limit, 500),
                skip: offset,
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        return { items, total, limit, offset }
    }

}

