import { Module } from "@nestjs/common";
import { ShiftplanBookingRulesModule } from "../shiftplan-booking-rules/shiftplan-booking-rules.module";
import { AuditModule } from "../audit/audit.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ShiftplanController } from "./shiftplan.controller";
import { ShiftplanService } from "./shiftplan.service";

@Module({
  imports: [AuditModule, RealtimeModule, ShiftplanBookingRulesModule],
  providers: [ShiftplanService],
  controllers: [ShiftplanController],
  exports: [ShiftplanService],
})
export class ShiftplanModule {}
