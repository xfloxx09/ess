import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { CommonModule } from "./common/common.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AntraegeModule } from "./modules/antraege/antraege.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { ConfigModule } from "./modules/config/config.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { KpiModule } from "./modules/kpi/kpi.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ShiftplanModule } from "./modules/shiftplan/shiftplan.module";
import { AdminOrgAccessModule } from "./modules/admin-org-access/admin-org-access.module";
import { ControllingWorkflowModule } from "./modules/controlling-workflow/controlling-workflow.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    CommonModule,
    RealtimeModule,
    NotificationsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    AdminOrgAccessModule,
    AntraegeModule,
    SalesModule,
    CalendarModule,
    KpiModule,
    ShiftplanModule,
    ControllingWorkflowModule,
    ConfigModule,
    ImportsModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
