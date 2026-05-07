import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

@Module({
  imports: [AuditModule],
  providers: [CalendarService],
  controllers: [CalendarController],
})
export class CalendarModule {}
