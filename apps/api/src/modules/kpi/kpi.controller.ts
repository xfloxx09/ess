import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestUser } from "../../common/authz.types";
import { KpiService } from "./kpi.service";

const REVIEW_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["controlling_review"],
};

const DASHBOARD_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["dashboard_kpi", "controlling_review"],
};

const LEADERSHIP_ACCESS: { anyViews: AppViewKey[] } = {
  anyViews: ["leadership_dashboard"],
};

@Controller("kpi")
@UseGuards(JwtAuthGuard, RolesGuard)
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get("agent-month")
  @Roles("AGENT", "ADMIN", "CONTROLLING")
  agentMonth(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    const target = req.user.role === "AGENT" ? req.user.id : agentId ?? req.user.id;
    return this.kpi.listAgentMonth(target, month);
  }

  @Get("agent-kpis")
  @Roles("AGENT")
  agentKpis(@Req() req: { user: RequestUser }, @Query("month") month: string) {
    return this.kpi.getAgentKpiTabData(req.user.id, month);
  }

  @Get("org-month")
  @Access(REVIEW_ACCESS)
  orgMonth(@Query("month") month: string, @Query("search") search?: string) {
    return this.kpi.listOrgMonth(month, search);
  }

  @Get("dashboard")
  @Access(DASHBOARD_ACCESS)
  dashboard(@Query("month") month: string) {
    return this.kpi.dashboardSummary(month);
  }

  @Get("leadership")
  @Access(LEADERSHIP_ACCESS)
  leadership(@Req() req: { user: RequestUser }, @Query("month") month: string) {
    return this.kpi.leadershipSummary(month, req.user);
  }
}
