import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import type { RequestUser } from "../../common/authz.types";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { ShiftplanBookingRulesService } from "../shiftplan-booking-rules/shiftplan-booking-rules.service";

type SlotInput = {
  agentId: string;
  date: string;
  slotIndex: number;
  controllerCode: string;
  rawCode: string;
  expectedVersion?: number;
};

@Injectable()
export class ShiftplanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly bookingRules: ShiftplanBookingRulesService,
  ) {}

  async listAgents(user?: RequestUser) {
    const where: Prisma.UserWhereInput = { role: "AGENT", active: true, deletedAt: null };
    const visible = await this.getAgentIdsVisibleTo(user);
    if (visible !== null) {
      where.id = { in: visible };
    }
    const agents = await this.prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, teamId: true },
      orderBy: { fullName: "asc" },
    });
    return agents;
  }

  async listProjects(user?: RequestUser) {
    const where: Prisma.ProjectWhereInput = { active: true };
    if (user && user.role !== "ADMIN" && user.allowedProjectIds) {
      where.id = { in: user.allowedProjectIds };
    }
    return this.prisma.project.findMany({ where, select: { id: true, name: true, abteilungId: true }, orderBy: { name: "asc" } });
  }

  async listTeamsByProject(projectId: string, user?: RequestUser) {
    await this.assertProjectVisible(user, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("Project not found");
    const teams = await this.prisma.team.findMany({
      where: { projectId, active: true },
      orderBy: { name: "asc" },
      include: {
        agents: {
          where: { role: "AGENT", active: true, deletedAt: null },
          select: { id: true, fullName: true, email: true },
          orderBy: { fullName: "asc" },
        },
      },
    });
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      projectId: team.projectId,
      agents: team.agents,
    }));
  }

  async rosterDayMatrix(projectId: string, teamId: string, date: string, user?: RequestUser) {
    await this.assertProjectVisible(user, projectId);
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.projectId !== projectId) {
      throw new BadRequestException("Team does not belong to this project");
    }
    const codes = await this.listCodes();
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT", teamId, active: true, deletedAt: null },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    });
    const agentRows = await Promise.all(
      agents.map(async (agent) => ({
        agentId: agent.id,
        fullName: agent.fullName,
        email: agent.email,
        slots: await this.buildSlotsForAgent(agent.id, date),
      })),
    );
    return {
      projectId,
      teamId: team.id,
      teamName: team.name,
      date,
      quarterHourCodes: codes,
      agents: agentRows,
    };
  }

  async rosterDayProject(projectId: string, date: string, user?: RequestUser) {
    await this.assertProjectVisible(user, projectId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, shiftplanTargetDayMinutes: true, shiftplanPausePatternJson: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    const codes = await this.listCodes();
    const teams = await this.prisma.team.findMany({
      where: { projectId, active: true },
      orderBy: { name: "asc" },
      include: {
        agents: {
          where: { role: "AGENT", active: true, deletedAt: null },
          select: { id: true, fullName: true, email: true, fte: true },
          orderBy: { fullName: "asc" },
        },
      },
    });
    const teamPayload = await Promise.all(
      teams.map(async (team) => ({
        teamId: team.id,
        teamName: team.name,
        agents: await Promise.all(
          team.agents.map(async (agent) => ({
            agentId: agent.id,
            fullName: agent.fullName,
            email: agent.email,
            fte: agent.fte,
            slots: await this.buildSlotsForAgent(agent.id, date),
          })),
        ),
      })),
    );
    return {
      projectId,
      projectName: project.name,
      date,
      quarterHourCodes: codes,
      teams: teamPayload,
      planner: {
        targetDayMinutes: project.shiftplanTargetDayMinutes,
        pausePattern: parsePausePattern(project.shiftplanPausePatternJson),
      },
    };
  }

  async rosterProjectMonth(projectId: string, month: string, user?: RequestUser) {
    await this.assertProjectVisible(user, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("Project not found");
    const dates = datesForMonth(month);
    const teams = await this.prisma.team.findMany({
      where: { projectId, active: true },
      orderBy: { name: "asc" },
      include: {
        agents: {
          where: { role: "AGENT", active: true, deletedAt: null },
          select: { id: true, fullName: true, email: true },
          orderBy: { fullName: "asc" },
        },
      },
    });
    const teamPayload = await Promise.all(
      teams.map(async (team) => ({
        teamId: team.id,
        teamName: team.name,
        agents: await Promise.all(
          team.agents.map(async (agent) => {
            const cells = await this.prisma.shiftplanCell.findMany({
              where: { agentId: agent.id, date: { in: dates } },
            });
            const days = dates.map((dayDate) => {
              const dayCells = cells.filter((c) => c.date === dayDate);
              const aAgreed = dayCells.filter((c) => c.controllerCode === "A" && c.rawCode === "A").length;
              const worked = dayCells.some((c) => c.controllerCode === "A");
              const present = dayCells.length > 0;
              const disagreed = dayCells.filter((c) => c.controllerCode !== c.rawCode).length;
              return { date: dayDate, present, worked, aAgreedSlots: aAgreed, cellCount: dayCells.length, disagreedSlots: disagreed };
            });
            return { agentId: agent.id, fullName: agent.fullName, email: agent.email, days };
          }),
        ),
      })),
    );
    return { projectId, projectName: project.name, month, dates, teams: teamPayload };
  }

  async listCodes() {
    return this.prisma.quarterHourCode.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  }

  async upsertCell(input: SlotInput, user?: RequestUser) {
    await this.assertControllerMayEditAgent(user, input.agentId);
    const { agentId, date, slotIndex, controllerCode, rawCode, expectedVersion } = input;
    const existing = await this.prisma.shiftplanCell.findUnique({
      where: { agentId_date_slotIndex: { agentId, date, slotIndex } },
    });
    let cellId: string;
    let nextVersion: number;
    if (existing) {
      if (expectedVersion !== undefined && expectedVersion !== existing.version) {
        throw new ConflictException("Shiftplan cell version conflict. Reload and retry.");
      }
      const updated = await this.prisma.shiftplanCell.update({
        where: { id: existing.id },
        data: { controllerCode, rawCode, version: { increment: 1 } },
      });
      cellId = updated.id;
      nextVersion = updated.version;
    } else {
      const created = await this.prisma.shiftplanCell.create({
        data: { agentId, date, slotIndex, controllerCode, rawCode, version: 1 },
      });
      cellId = created.id;
      nextVersion = created.version;
    }
    await this.prisma.shiftplanHistory.create({
      data: {
        cellId,
        agentId,
        date,
        slotIndex,
        action: "UPSERT",
        version: nextVersion,
        payload: { controllerCode, rawCode },
      },
    });

    // Emit realtime event to project + team rooms
    const agent = await this.prisma.user.findUnique({ where: { id: agentId }, select: { teamId: true } });
    if (agent?.teamId) {
      const team = await this.prisma.team.findUnique({ where: { id: agent.teamId } });
      if (team) {
        this.realtime.emit(
          {
            type: "roster.cellChanged",
            projectId: team.projectId,
            teamId: team.id,
            agentId,
            date,
            slotIndex,
            controllerCode,
            rawCode,
            version: nextVersion,
          },
          [`project:${team.projectId}`, `team:${team.id}`],
        );
      }
    }

    return { id: cellId, agentId, date, slotIndex, controllerCode, rawCode, version: nextVersion };
  }

  async bulkUpsert(input: { agentId: string; date: string; slots: Array<{ slotIndex: number; controllerCode: string; rawCode: string; expectedVersion?: number }> }, user?: RequestUser) {
    const out: Array<Awaited<ReturnType<typeof this.upsertCell>>> = [];
    for (const slot of input.slots) {
      out.push(
        await this.upsertCell(
          {
            agentId: input.agentId,
            date: input.date,
            slotIndex: slot.slotIndex,
            controllerCode: slot.controllerCode,
            rawCode: slot.rawCode,
            expectedVersion: slot.expectedVersion,
          },
          user,
        ),
      );
    }
    return out;
  }

  async bulkClearSlots(input: { agentId: string; date: string; slotIndices: number[] }, user?: RequestUser) {
    await this.assertControllerMayEditAgent(user, input.agentId);
    const unique = [...new Set(input.slotIndices)].sort((a, b) => a - b);
    let cleared = 0;
    for (const slotIndex of unique) {
      const existing = await this.prisma.shiftplanCell.findUnique({
        where: { agentId_date_slotIndex: { agentId: input.agentId, date: input.date, slotIndex } },
      });
      if (!existing) continue;
      await this.prisma.shiftplanHistory.create({
        data: {
          cellId: existing.id,
          agentId: existing.agentId,
          date: existing.date,
          slotIndex: existing.slotIndex,
          action: "DELETE",
          version: existing.version,
          payload: { controllerCode: existing.controllerCode, rawCode: existing.rawCode },
        },
      });
      await this.prisma.shiftplanCell.delete({ where: { id: existing.id } });
      cleared += 1;
      await this.emitRosterCellDeleted(input.agentId, input.date, slotIndex);
    }
    return { cleared };
  }

  async copyProjectDay(projectId: string, fromDate: string, toDate: string, user?: RequestUser) {
    if (fromDate === toDate) {
      throw new BadRequestException("fromDate and toDate must differ");
    }
    await this.assertProjectVisible(user, projectId);
    const agentIds = await this.listProjectAgentIds(projectId);
    if (agentIds.length === 0) {
      return { agentsTouched: 0, slotsWritten: 0 };
    }
    await this.prisma.shiftplanCell.deleteMany({ where: { agentId: { in: agentIds }, date: toDate } });
    const sourceCells = await this.prisma.shiftplanCell.findMany({
      where: { agentId: { in: agentIds }, date: fromDate },
      orderBy: [{ agentId: "asc" }, { slotIndex: "asc" }],
    });
    let slotsWritten = 0;
    for (const agentId of agentIds) {
      const rows = sourceCells.filter((c) => c.agentId === agentId);
      if (rows.length === 0) continue;
      await this.bulkUpsert(
        {
          agentId,
          date: toDate,
          slots: rows.map((c) => ({
            slotIndex: c.slotIndex,
            controllerCode: c.controllerCode,
            rawCode: c.rawCode,
          })),
        },
        user,
      );
      slotsWritten += rows.length;
    }
    const agentsTouched = new Set(sourceCells.map((c) => c.agentId)).size;
    return { agentsTouched, slotsWritten };
  }

  async copyProjectMonth(projectId: string, fromMonth: string, toMonth: string, user?: RequestUser) {
    if (fromMonth === toMonth) {
      throw new BadRequestException("fromMonth and toMonth must differ");
    }
    await this.assertProjectVisible(user, projectId);
    const fromDates = datesForMonth(fromMonth);
    const toDates = datesForMonth(toMonth);
    const n = Math.min(fromDates.length, toDates.length);
    let daysCopied = 0;
    for (let i = 0; i < n; i++) {
      const r = await this.copyProjectDay(projectId, fromDates[i], toDates[i], user);
      if (r.slotsWritten > 0) daysCopied += 1;
    }
    return { dayPairs: n, daysWithData: daysCopied };
  }

  async assertMayViewAgentMonth(user: RequestUser, targetAgentId: string) {
    if (user.role === "ADMIN" || user.role === "CONTROLLING" || user.role === "SCHICHTPLANUNG") return;
    if (user.role === "AGENT" && user.id === targetAgentId) return;
    if (user.role === "AGENT" && user.allowedProjectIds) {
      const visible = await this.getAgentIdsVisibleTo(user);
      if (visible?.includes(targetAgentId)) return;
    }
    throw new ForbiddenException("Not allowed to load this agent's shiftplan.");
  }

  async listAgentMonth(agentId: string, month: string, viewer?: RequestUser) {
    if (viewer?.role === "AGENT" && viewer.id === agentId) {
      const vis = await this.bookingRules.getAgentShiftplanVisibilityForMonth(agentId, month);
      if (vis === "PLANNING_HIDDEN") return [];
    }
    return this.prisma.shiftplanCell.findMany({
      where: { agentId, date: { startsWith: month } },
      orderBy: [{ date: "asc" }, { slotIndex: "asc" }],
    });
  }

  async listAgentFinalMonth(agentId: string, month: string, viewer?: RequestUser) {
    const hide =
      viewer?.role === "AGENT" &&
      viewer.id === agentId &&
      (await this.bookingRules.getAgentShiftplanVisibilityForMonth(agentId, month)) === "PLANNING_HIDDEN";

    if (hide) {
      const bookings = await this.prisma.calendarBooking.findMany({
        where: { agentId, date: { startsWith: month } },
        orderBy: { date: "asc" },
      });
      return {
        shiftplanHiddenFromAgent: true as const,
        bookings,
        cells: [] as never[],
        antraege: [] as never[],
        days: [] as never[],
      };
    }

    const [cells, bookings, antraegeAll, bookingTypes] = await Promise.all([
      this.prisma.shiftplanCell.findMany({ where: { agentId, date: { startsWith: month } } }),
      this.prisma.calendarBooking.findMany({ where: { agentId, date: { startsWith: month } } }),
      this.prisma.antrag.findMany({ where: { agentId, date: { startsWith: month } } }),
      this.prisma.bookingType.findMany(),
    ]);
    const byDate = new Map<
      string,
      {
        date: string;
        booking?: string;
        bookingCode?: string;
        agreed: number;
        disagreed: number;
        A: number;
        P: number;
        antragSlots: number;
        antragTypes: string[];
        antragPendingSlots: number;
        antragPendingTypes: string[];
      }
    >();
    for (const booking of bookings) {
      const type = bookingTypes.find((t) => t.id === booking.bookingTypeId);
      byDate.set(booking.date, {
        date: booking.date,
        booking: type?.label,
        bookingCode: type?.code,
        agreed: 0,
        disagreed: 0,
        A: 0,
        P: 0,
        antragSlots: 0,
        antragTypes: [],
        antragPendingSlots: 0,
        antragPendingTypes: [],
      });
    }
    for (const cell of cells) {
      const current =
        byDate.get(cell.date) ??
        {
          date: cell.date,
          booking: undefined,
          bookingCode: undefined,
          agreed: 0,
          disagreed: 0,
          A: 0,
          P: 0,
          antragSlots: 0,
          antragTypes: [] as string[],
          antragPendingSlots: 0,
          antragPendingTypes: [] as string[],
        };
      if (cell.controllerCode === cell.rawCode) {
        current.agreed += 1;
        if (cell.controllerCode === "A") current.A += 1;
        if (cell.controllerCode === "P") current.P += 1;
      } else {
        current.disagreed += 1;
      }
      byDate.set(cell.date, current);
    }
    for (const a of antraegeAll) {
      const current =
        byDate.get(a.date) ??
        {
          date: a.date,
          booking: undefined,
          bookingCode: undefined,
          agreed: 0,
          disagreed: 0,
          A: 0,
          P: 0,
          antragSlots: 0,
          antragTypes: [] as string[],
          antragPendingSlots: 0,
          antragPendingTypes: [] as string[],
        };
      const span = a.toSlot - a.fromSlot + 1;
      if (a.status === "APPROVED") {
        current.antragSlots += span;
        if (!current.antragTypes.includes(a.type)) current.antragTypes.push(a.type);
      } else if (a.status === "PENDING") {
        current.antragPendingSlots += span;
        if (!current.antragPendingTypes.includes(a.type)) current.antragPendingTypes.push(a.type);
      }
      byDate.set(a.date, current);
    }
    return {
      bookings,
      cells,
      antraege: antraegeAll,
      days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async reconciliation(month: string, search: string | undefined, minAgreement: number, user?: RequestUser) {
    const agents = await this.listAgents(user);
    const filtered = !search
      ? agents
      : agents.filter(
          (a) => a.fullName.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()),
        );
    const rows = await Promise.all(
      filtered.map(async (agent) => {
        const final = await this.listAgentFinalMonth(agent.id, month);
        const agreed = final.days.reduce((sum, day) => sum + day.agreed, 0);
        const disagreed = final.days.reduce((sum, day) => sum + day.disagreed, 0);
        const agreementPct = agreed + disagreed === 0 ? 100 : (agreed / (agreed + disagreed)) * 100;
        return {
          ...agent,
          month,
          bookedDays: final.days.length,
          agreedSlots: agreed,
          disagreedSlots: disagreed,
          agreementPct,
        };
      }),
    );
    return rows.filter((r) => r.agreementPct >= minAgreement);
  }

  async listHistory(month: string, agentId: string | undefined, user?: RequestUser) {
    const visible = await this.getAgentIdsVisibleTo(user);
    const where: Prisma.ShiftplanHistoryWhereInput = { date: { startsWith: month } };
    if (agentId) where.agentId = agentId;
    if (visible !== null) where.agentId = where.agentId ? where.agentId : { in: visible };
    return this.prisma.shiftplanHistory.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  }

  private async emitRosterCellDeleted(agentId: string, date: string, slotIndex: number) {
    const agent = await this.prisma.user.findUnique({ where: { id: agentId }, select: { teamId: true } });
    if (!agent?.teamId) return;
    const team = await this.prisma.team.findUnique({ where: { id: agent.teamId } });
    if (!team) return;
    this.realtime.emit(
      { type: "roster.cellDeleted", projectId: team.projectId, teamId: team.id, agentId, date, slotIndex },
      [`project:${team.projectId}`, `team:${team.id}`],
    );
  }

  private async listProjectAgentIds(projectId: string): Promise<string[]> {
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT", active: true, deletedAt: null, team: { projectId, active: true } },
      select: { id: true },
    });
    return agents.map((a) => a.id);
  }

  // ----------------------- helpers -----------------------

  private async buildSlotsForAgent(agentId: string, date: string) {
    const dayCells = await this.prisma.shiftplanCell.findMany({ where: { agentId, date } });
    const bySlot = new Map(dayCells.map((cell) => [cell.slotIndex, cell]));
    return Array.from({ length: 96 }, (_, slotIndex) => {
      const cell = bySlot.get(slotIndex);
      if (!cell) {
        return {
          slotIndex,
          controllerCode: null as string | null,
          rawCode: null as string | null,
          agreed: false,
          version: null as number | null,
        };
      }
      return {
        slotIndex,
        controllerCode: cell.controllerCode,
        rawCode: cell.rawCode,
        agreed: cell.controllerCode === cell.rawCode,
        version: cell.version,
      };
    });
  }

  private async getAgentIdsVisibleTo(user?: Pick<RequestUser, "role" | "allowedProjectIds">): Promise<string[] | null> {
    if (!user || user.role === "ADMIN" || !user.allowedProjectIds) return null;
    const teams = await this.prisma.team.findMany({
      where: { projectId: { in: user.allowedProjectIds } },
      select: { id: true },
    });
    if (teams.length === 0) return [];
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT", teamId: { in: teams.map((t) => t.id) }, active: true, deletedAt: null },
      select: { id: true },
    });
    return agents.map((a) => a.id);
  }

  private async assertProjectVisible(user: RequestUser | undefined, projectId: string) {
    if (!user || user.role === "ADMIN" || !user.allowedProjectIds) return;
    if (!user.allowedProjectIds.includes(projectId)) {
      throw new ForbiddenException("Project not permitted for this account");
    }
  }

  private async assertControllerMayEditAgent(user: RequestUser | undefined, agentId: string) {
    if (!user) return;
    const agent = await this.prisma.user.findUnique({ where: { id: agentId }, select: { id: true, role: true, teamId: true } });
    if (!agent || agent.role !== "AGENT") throw new BadRequestException("Invalid agent");
    if (user.role === "ADMIN") return;
    if (user.role === "AGENT" && user.allowedProjectIds === null) {
      if (user.id !== agentId) throw new ForbiddenException("Agents may only update their own shiftplan cells here.");
      return;
    }
    if (user.allowedProjectIds === null) return;
    if (!agent.teamId) throw new ForbiddenException("Agent has no team");
    const team = await this.prisma.team.findUnique({ where: { id: agent.teamId }, select: { projectId: true } });
    if (!team || !user.allowedProjectIds.includes(team.projectId)) {
      throw new ForbiddenException("Agent is outside your permitted projects");
    }
  }
}

function parsePausePattern(raw: unknown): Array<{ workMinutes: number; pauseMinutes: number }> {
  const fallback = [
    { workMinutes: 120, pauseMinutes: 15 },
    { workMinutes: 120, pauseMinutes: 30 },
    { workMinutes: 120, pauseMinutes: 15 },
  ];
  if (!raw || !Array.isArray(raw)) return fallback;
  const out: Array<{ workMinutes: number; pauseMinutes: number }> = [];
  for (const row of raw) {
    if (typeof row === "object" && row !== null && "workMinutes" in row && "pauseMinutes" in row) {
      const w = Number((row as { workMinutes: unknown }).workMinutes);
      const p = Number((row as { pauseMinutes: unknown }).pauseMinutes);
      if (Number.isFinite(w) && Number.isFinite(p) && w >= 15) {
        out.push({
          workMinutes: Math.min(720, Math.max(15, Math.floor(w))),
          pauseMinutes: Math.min(180, Math.max(0, Math.floor(p))),
        });
      }
    }
  }
  return out.length > 0 ? out : fallback;
}

function datesForMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}
