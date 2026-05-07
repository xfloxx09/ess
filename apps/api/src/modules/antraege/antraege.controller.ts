import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AntragStatus, AntragType } from "@prisma/client";
import type { AppViewKey, UserRole } from "@ess/shared";
import { antragCreateSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AntraegeService } from "./antraege.service";

const ANTR_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["controlling_antraege"],
};

@Controller("antraege")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AntraegeController {
  constructor(
    private readonly antraege: AntraegeService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Access(ANTR_ACCESS)
  async create(
    @Req() req: { user: RequestUser },
    @Body(Body$(antragCreateSchema))
    body: { agentId: string; date: string; fromSlot: number; toSlot: number; type: AntragType; note?: string },
  ) {
    const created = await this.antraege.create({ actorUserId: req.user.id, ...body });
    await this.audit.log(req.user.id, "CREATE", "antraege.entry", created.id, created);
    return created;
  }

  @Post(":id/approve")
  @Access(ANTR_ACCESS)
  async approve(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const updated = await this.antraege.approve(req.user.id, id);
    await this.audit.log(req.user.id, "UPDATE", "antraege.approve", id, updated);
    return updated;
  }

  @Post(":id/reject")
  @Access(ANTR_ACCESS)
  async reject(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const updated = await this.antraege.reject(req.user.id, id);
    await this.audit.log(req.user.id, "UPDATE", "antraege.reject", id, updated);
    return updated;
  }

  @Get("month")
  @Access(ANTR_ACCESS)
  month(@Query("month") month: string, @Query("agentId") agentId?: string, @Query("status") status?: AntragStatus) {
    return this.antraege.listMonth(month, agentId, status);
  }

  @Get("history")
  @Roles("ADMIN", "CONTROLLING", "AGENT")
  history(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    const targetAgent = req.user.role === "AGENT" ? req.user.id : agentId;
    return this.antraege.listHistoryForMonth(month, targetAgent);
  }

  @Get("mine")
  @Roles("AGENT")
  mine(@Req() req: { user: RequestUser }, @Query("month") month: string) {
    return this.antraege.listMonth(month, req.user.id);
  }
}
