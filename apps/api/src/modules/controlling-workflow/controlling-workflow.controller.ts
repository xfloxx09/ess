import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey } from "@ess/shared";
import {
  controllingFinalDecisionSchema,
  controllingL2DecisionSchema,
  controllingLiveObservationSchema,
  controllingPolicyUpdateSchema,
  controllingSessionCreateSchema,
} from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ControllingWorkflowService } from "./controlling-workflow.service";

const L1: { anyViews: AppViewKey[] } = {
  anyViews: ["controlling_level1"],
};

const L2: { anyViews: AppViewKey[] } = {
  anyViews: ["controlling_level2"],
};

const FINAL: { anyViews: AppViewKey[] } = {
  anyViews: ["controlling_endkontrolle"],
};

const POLICY_READ: { anyViews: AppViewKey[] } = {
  anyViews: ["controlling_level1", "admin_config"],
};

@Controller("controlling")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControllingWorkflowController {
  constructor(
    private readonly workflow: ControllingWorkflowService,
    private readonly audit: AuditService,
  ) {}

  @Get("policy")
  @Access(POLICY_READ)
  async policy() {
    return this.workflow.getPolicy();
  }

  @Patch("policy")
  @Roles("ADMIN")
  async patchPolicy(@Req() req: { user: RequestUser }, @Body(Body$(controllingPolicyUpdateSchema)) body: { liveBlockMinutes: number }) {
    const saved = await this.workflow.setPolicy(body.liveBlockMinutes);
    await this.audit.log(req.user.id, "UPDATE", "controlling.policy", "singleton", saved);
    return saved;
  }

  @Get("org-filters")
  @Access(L1)
  orgFilters(@Req() req: { user: RequestUser }) {
    return this.workflow.orgFilterTree(req.user);
  }

  @Post("sessions")
  @Access(L1)
  async createSession(
    @Req() req: { user: RequestUser },
    @Body(Body$(controllingSessionCreateSchema)) body: { date: string; abteilungId?: string | null; projectId: string; teamIds: string[] },
  ) {
    const session = await this.workflow.createSession(req.user, body);
    await this.audit.log(req.user.id, "CREATE", "controlling.session", session.id, session);
    return session;
  }

  @Get("sessions/:id/board")
  @Access(L1)
  sessionBoard(@Req() req: { user: RequestUser }, @Param("id") id: string, @Query("date") date?: string) {
    return this.workflow.getSessionBoard(id, req.user, date || undefined);
  }

  @Post("live-observations")
  @Access(L1)
  async upsertObservation(
    @Req() req: { user: RequestUser },
    @Body(Body$(controllingLiveObservationSchema)) body: { sessionId: string; agentId: string; date: string; blockIndex: number; code: "A" | "P" | "N" },
  ) {
    const row = await this.workflow.upsertLiveObservation(req.user, body);
    await this.audit.log(req.user.id, "UPSERT", "controlling.liveObservation", row.id, row);
    return row;
  }

  @Get("l2/board")
  @Access(L2)
  l2Board(@Req() req: { user: RequestUser }, @Query("projectId") projectId: string, @Query("date") date: string) {
    return this.workflow.l2Board(projectId, date, req.user);
  }

  @Patch("l2/:agentId/:date")
  @Access(L2)
  async l2Patch(
    @Req() req: { user: RequestUser },
    @Param("agentId") agentId: string,
    @Param("date") date: string,
    @Body(Body$(controllingL2DecisionSchema)) body: { released: boolean; note?: string },
  ) {
    const row = await this.workflow.setL2Decision(req.user, agentId, date, body.released, body.note);
    await this.audit.log(req.user.id, "UPDATE", "controlling.l2", row.id, row);
    return row;
  }

  @Get("final/board")
  @Access(FINAL)
  finalBoard(@Req() req: { user: RequestUser }, @Query("projectId") projectId: string, @Query("date") date: string) {
    return this.workflow.finalBoard(projectId, date, req.user);
  }

  @Patch("final/:agentId/:date")
  @Access(FINAL)
  async finalPatch(
    @Req() req: { user: RequestUser },
    @Param("agentId") agentId: string,
    @Param("date") date: string,
    @Body(Body$(controllingFinalDecisionSchema)) body: { hoursDelta: number; note?: string },
  ) {
    const row = await this.workflow.setFinalDecision(req.user, agentId, date, body.hoursDelta, body.note);
    await this.audit.log(req.user.id, "UPDATE", "controlling.final", row.id, row);
    return row;
  }
}
