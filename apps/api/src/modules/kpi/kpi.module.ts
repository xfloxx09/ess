import { Module } from "@nestjs/common";
import { KpiController } from "./kpi.controller";
import { KpiService } from "./kpi.service";

@Module({
  providers: [KpiService],
  controllers: [KpiController],
  exports: [KpiService],
})
export class KpiModule {}
