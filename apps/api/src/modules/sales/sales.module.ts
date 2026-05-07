import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuditModule],
  providers: [SalesService],
  controllers: [SalesController],
})
export class SalesModule {}
