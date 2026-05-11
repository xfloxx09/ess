import { Module } from "@nestjs/common";
import { AdminOrgAccessModule } from "../admin-org-access/admin-org-access.module";
import { AuditModule } from "../audit/audit.module";
import { AdminSchichtplanerAccessController } from "./admin-schichtplaner-access.controller";
import { AdminSchichtplanerAccessService } from "./admin-schichtplaner-access.service";

@Module({
  imports: [AdminOrgAccessModule, AuditModule],
  controllers: [AdminSchichtplanerAccessController],
  providers: [AdminSchichtplanerAccessService],
})
export class AdminSchichtplanerAccessModule {}
