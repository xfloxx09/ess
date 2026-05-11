import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import {
  shiftCellBulkClearSchema,
  shiftCellBulkUpsertSchema,
  shiftCellUpsertSchema,
  shiftplanCopyDaySchema,
  shiftplanCopyMonthSchema,
} from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ShiftplanService } from "./shiftplan.service";

const SHIFTPLAN_CTRL: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING", "SCHICHTPLANUNG"],
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

  @Post("bulk-clear")
  @Access(SHIFTPLAN_CTRL)
  async bulkClear(
    @Req() req: { user: RequestUser },
    @Body(Body$(shiftCellBulkClearSchema))
    body: { agentId: string; date: string; slotIndices: number[] },
  ) {
    const result = await this.shiftplan.bulkClearSlots(body, req.user);
    await this.audit.log(req.user.id, "DELETE", "shiftplan.bulk-clear", null, { ...body, cleared: result.cleared });
    return result;
  }

  @Post("copy-day")
  @Access(SHIFTPLAN_CTRL)
  async copyDay(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanCopyDaySchema)) body: { projectId: string; fromDate: string; toDate: string }) {
    const result = await this.shiftplan.copyProjectDay(body.projectId, body.fromDate, body.toDate, req.user);
    await this.audit.log(req.user.id, "CREATE", "shiftplan.copy-day", null, { ...body, ...result });
    return result;
  }

  @Post("copy-month")
  @Access(SHIFTPLAN_CTRL)
  async copyMonth(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanCopyMonthSchema)) body: { projectId: string; fromMonth: string; toMonth: string }) {
    const result = await this.shiftplan.copyProjectMonth(body.projectId, body.fromMonth, body.toMonth, req.user);
    await this.audit.log(req.user.id, "CREATE", "shiftplan.copy-month", null, { ...body, ...result });
    return result;
  }

  @Get("codes")
  @Roles("ADMIN", "CONTROLLING", "SCHICHTPLANUNG", "AGENT")
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

  /** Kalenderbuchungen je Buchungstyp (Früh, Spät, Urlaub, Krank, …) für alle Agenten des Projekts — Tag oder Monat. */
  @Get("calendar-booking-stats")
  @Access(SHIFTPLAN_CTRL)
  calendarBookingStats(
    @Req() req: { user: RequestUser },
    @Query("projectId") projectId: string,
    @Query("month") month?: string,
    @Query("date") date?: string,
  ) {
    if (!projectId) {
      throw new BadRequestException("projectId is required");
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return this.shiftplan.projectCalendarBookingStats(projectId, req.user, { date });
    }
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      return this.shiftplan.projectCalendarBookingStats(projectId, req.user, { month });
    }
    throw new BadRequestException("Provide date=YYYY-MM-DD or month=YYYY-MM");
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
  @Roles("AGENT", "ADMIN", "CONTROLLING", "SCHICHTPLANUNG")
  async agentMonth(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    const target = req.user.role === "AGENT" ? req.user.id : agentId ?? req.user.id;
    await this.shiftplan.assertMayViewAgentMonth(req.user, target);
    return this.shiftplan.listAgentMonth(target, month, req.user);
  }

  @Get("agent-final-month")
  @Roles("AGENT", "ADMIN", "CONTROLLING", "SCHICHTPLANUNG")
  async agentFinalMonth(@Req() req: { user: RequestUser }, @Query("month") month: string, @Query("agentId") agentId?: string) {
    const target = req.user.role === "AGENT" ? req.user.id : agentId ?? req.user.id;
    await this.shiftplan.assertMayViewAgentMonth(req.user, target);
    return this.shiftplan.listAgentFinalMonth(target, month, req.user);
  }
}
