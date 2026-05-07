import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AntraegeController } from "./antraege.controller";
import { AntraegeService } from "./antraege.service";

@Module({
  imports: [AuditModule, NotificationsModule, RealtimeModule],
  providers: [AntraegeService],
  controllers: [AntraegeController],
})
export class AntraegeModule {}
