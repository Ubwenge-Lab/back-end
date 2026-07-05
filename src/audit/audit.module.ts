import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditCleanupCron } from "./audit-cleanup.cron";

@Module({
    imports: [PrismaModule, NotificationsModule],
    providers: [AuditService, AuditCleanupCron],
    controllers: [AuditController],
    exports: [AuditService],
})
export class AuditModule { }