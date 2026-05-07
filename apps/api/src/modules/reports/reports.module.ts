import { Module } from "@nestjs/common";
import { KpiModule } from "../kpi/kpi.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ShiftplanModule } from "../shiftplan/shiftplan.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [KpiModule, ShiftplanModule, RealtimeModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
