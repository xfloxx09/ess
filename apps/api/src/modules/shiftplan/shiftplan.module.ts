import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ShiftplanController } from "./shiftplan.controller";
import { ShiftplanService } from "./shiftplan.service";

@Module({
  imports: [AuditModule, RealtimeModule],
  providers: [ShiftplanService],
  controllers: [ShiftplanController],
  exports: [ShiftplanService],
})
export class ShiftplanModule {}
