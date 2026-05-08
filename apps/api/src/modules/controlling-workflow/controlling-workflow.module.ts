import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ShiftplanModule } from "../shiftplan/shiftplan.module";
import { ControllingWorkflowController } from "./controlling-workflow.controller";
import { ControllingWorkflowService } from "./controlling-workflow.service";

@Module({
  imports: [ShiftplanModule, AuditModule],
  providers: [ControllingWorkflowService],
  controllers: [ControllingWorkflowController],
})
export class ControllingWorkflowModule {}
