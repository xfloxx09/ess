import { Module } from "@nestjs/common";
import { ShiftplanBookingRulesModule } from "../shiftplan-booking-rules/shiftplan-booking-rules.module";
import { AuditModule } from "../audit/audit.module";
import { ConfigController } from "./config.controller";
import { ConfigService } from "./config.service";

@Module({
  imports: [AuditModule, ShiftplanBookingRulesModule],
  providers: [ConfigService],
  controllers: [ConfigController],
})
export class ConfigModule {}
