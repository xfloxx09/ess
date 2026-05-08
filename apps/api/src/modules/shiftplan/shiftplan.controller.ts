import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import { shiftCellBulkUpsertSchema, shiftCellUpsertSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ShiftplanService } from "./shiftplan.service";

const SHIFTPLAN_CTRL: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["controlling_roster_day", "controlling_roster_month"],
};

const CONTROLLING_WORKFLOW_VIEWS: AppViewKey[] = ["controlling_level1", "controlling_level2", "controlling_endkontrolle"];

const PROJECT_TEAM_ACCESS = {
  anyRoles: SHIFTPLAN_CTRL.anyRoles,
  anyViews: [...SHIFTPLAN_CTRL.anyViews, ...CONTROLLING_WORKFLOW_VIEWS],
};

@Controller("shiftplan")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftplanController {
  constructor(
    private readonly shiftplan: ShiftplanService,
    private readonly audit: AuditService,
  ) {}

  @Post("cell")
  @Access(SHIFTPLAN_CTRL)
  async upsertCell(
    @Req() req: { user: RequestUser },
    @Body(Body$(shiftCellUpsertSchema))
    body: { agentId: string; date: string; slotIndex: number; controllerCode: string; rawCode: string; expectedVersion?: number },
  ) {
    const cell = await this.shiftplan.upsertCell(body, req.user);
    await this.audit.log(req.user.id, "UPSERT", "shiftplan.cell", cell.id, cell);
    return cell;
  }

  @Post("bulk")
  @Access(SHIFTPLAN_CTRL)
  async bulkUpsert(
    @Req() req: { user: RequestUser },
    @Body(Body$(shiftCellBulkUpsertSchema))
    body: { agentId: string; date: string; slots: Array<{ slotIndex: number; controllerCode: string; rawCode: string; expectedVersion?: number }> },
  ) {
    const cells = await this.shiftplan.bulkUpsert(body, req.user);
    await this.audit.log(req.user.id, "UPSERT", "shiftplan.bulk", null, { count: cells.length, date: body.date, agentId: body.agentId });
    return cells;
  }

  @Get("codes")
  @Roles("ADMIN", "CONTROLLING", "AGENT")
  codes() {
    return this.shiftplan.listCodes();
  }

  @Get("agents")
  @Access({ anyRoles: SHIFTPLAN_CTRL.anyRoles, anyViews: [...SHIFTPLAN_CTRL.anyViews, "controlling_antraege", "controlling_review"] })
  agents(@Req() req: { user: RequestUser }) {
    return this.shiftplan.listAgents(req.user);
  }

  @Get("projects")
  @Access(PROJECT_TEAM_ACCESS)
  projects(@Req() req: { user: RequestUser }) {
    return this.shiftplan.listProjects(req.user);
  }

  @Get("teams")
  @Access(PROJECT_TEAM_ACCESS)
  teams(@Req() req: { user: RequestUser }, @Query("projectId") projectId: string) {
    return this.shiftplan.listTeamsByProject(projectId, req.user);
  }

  @Get("roster-day")
  @Access(SHIFTPLAN_CTRL)
  rosterDay(@Req() req: { user: RequestUser }, @Query("projectId") projectId: string, @Query("teamId") teamId: string, @Query("date") date: string) {
    return this.shiftplan.rosterDayMatrix(projectId, teamId, date, req.user);
  }

  @Get("roster-day-project")
  @Access(SHIFTPLAN_CTRL)
  rosterDayProject(@Req() req: { user: RequestUser }, @Query("projectId") projectId: string, @Query("date") date: string) {
    return this.shiftplan.rosterDayProject(projectId, date, req.user);
  }

  @Get("roster-month")
  @Access(SHIFTPLAN_CTRL)
  rosterMonth(@Req() req: { user: RequestUser }, @Query("projectId") projectId: string, @Query("month") month: string) {
    return this.shiftplan.rosterProjectMonth(projectId, month, req.user);
  }

  @Get("reconciliation")
  @Access(SHIFTPLAN_CTRL)
  reconciliation(
    @Req() req: { user: RequestUser },
    @Query("month") month: string,
    @Query("search") search?: string,
    @Query("minAgreement") minAgreement?: string,
  ) {
    return this.shiftplan.reconciliation(month, search, minAgreement ? Number(minAgreement) : 0, req.user);
  }

  @Get("history")
  @Access({ anyRoles: SHIFTPLAN_CTRL.anyRoles, anyViews: [...SHIFTPLAN_CTRL.anyViews, "controlling_review"] })
  history(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    return this.shiftplan.listHistory(month, agentId, req.user);
  }

  @Get("agent-month")
  @Roles("AGENT", "ADMIN", "CONTROLLING")
  async agentMonth(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    const target = req.user.role === "AGENT" ? req.user.id : agentId ?? req.user.id;
    await this.shiftplan.assertMayViewAgentMonth(req.user, target);
    return this.shiftplan.listAgentMonth(target, month);
  }

  @Get("agent-final-month")
  @Roles("AGENT", "ADMIN", "CONTROLLING")
  async agentFinalMonth(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    const target = req.user.role === "AGENT" ? req.user.id : agentId ?? req.user.id;
    await this.shiftplan.assertMayViewAgentMonth(req.user, target);
    return this.shiftplan.listAgentFinalMonth(target, month);
  }
}
