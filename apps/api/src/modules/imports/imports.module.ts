import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [AuditModule, RealtimeModule, NotificationsModule],
  providers: [ImportsService],
  controllers: [ImportsController],
})
export class ImportsModule {}
