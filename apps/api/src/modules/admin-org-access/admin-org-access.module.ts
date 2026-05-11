import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AdminOrgAccessController } from "./admin-org-access.controller";
import { AdminOrgAccessService } from "./admin-org-access.service";

@Module({
  imports: [AuditModule],
  controllers: [AdminOrgAccessController],
  providers: [AdminOrgAccessService],
  exports: [AdminOrgAccessService],
})
export class AdminOrgAccessModule {}
