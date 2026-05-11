import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { schichtplanerScopesSetSchema, type SchichtplanerScopesSetDto } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminSchichtplanerAccessService } from "./admin-schichtplaner-access.service";

@Controller("admin/schichtplaner-access")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminSchichtplanerAccessController {
  constructor(
    private readonly svc: AdminSchichtplanerAccessService,
    private readonly audit: AuditService,
  ) {}

  @Get("users")
  users() {
    return this.svc.listSchichtplanerUsers();
  }

  @Get(":userId/selection")
  selection(@Param("userId") userId: string) {
    return this.svc.getScopeSelection(userId);
  }

  @Put(":userId/scopes")
  async putScopes(
    @Req() req: { user: RequestUser },
    @Param("userId") userId: string,
    @Body(Body$(schichtplanerScopesSetSchema)) body: SchichtplanerScopesSetDto,
  ) {
    const out = await this.svc.setScopes(userId, body);
    await this.audit.log(req.user.id, "UPSERT", "admin.schichtplaner-scopes", userId, body);
    return out;
  }
}
