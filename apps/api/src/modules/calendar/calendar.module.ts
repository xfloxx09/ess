import { Module } from "@nestjs/common";
import { ShiftplanBookingRulesModule } from "../shiftplan-booking-rules/shiftplan-booking-rules.module";
import { ShiftplanModule } from "../shiftplan/shiftplan.module";
import { AuditModule } from "../audit/audit.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

@Module({
  imports: [AuditModule, ShiftplanBookingRulesModule, ShiftplanModule],
  providers: [CalendarService],
  controllers: [CalendarController],
})
export class CalendarModule {}
