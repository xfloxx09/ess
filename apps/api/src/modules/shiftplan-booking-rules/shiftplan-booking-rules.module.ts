import { Module } from "@nestjs/common";
import { ShiftplanBookingRulesService } from "./shiftplan-booking-rules.service";

@Module({
  providers: [ShiftplanBookingRulesService],
  exports: [ShiftplanBookingRulesService],
})
export class ShiftplanBookingRulesModule {}
