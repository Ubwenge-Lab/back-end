import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from '@nestjs/schedule'
import { SentryCron } from '@sentry/nestjs'
import { AuditService } from "./audit.service"

@Injectable()
export class AuditCleanupCron {
    private readonly logger = new Logger(AuditCleanupCron.name)

    constructor(private readonly auditService: AuditService) { }

    @SentryCron('audit-cleanup-job', {
        schedule: { type: 'crontab', value: '0 2 * * *' },
    })
    @Cron('0 2 * * *', { name: 'audit-cleanup-job' }) // Runs daily at 2:00 AM
    async handleCron() {
        this.logger.debug('Starting scheduled audit log cleanup...')

        // const cutoffDate = new Date()

        // cutoffDate.setMinutes(cutoffDate.getMinutes() - 5)

        // PRODUCTION MODE: cutoffDate.setDate(cutoffDate.getDate() - 7)
        // DEBUG MODE (5 minutes) - Use this for testing!
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - 14)

        await this.auditService.deleteOldLogs(cutoffDate)
    }
}