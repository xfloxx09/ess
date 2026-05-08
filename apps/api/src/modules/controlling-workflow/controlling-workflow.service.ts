import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ControllingLiveCode, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import type { RequestUser } from "../../common/authz.types";
import { ShiftplanService } from "../shiftplan/shiftplan.service";

export function berlinCalendarParts(now = new Date()): { dateKey: string; minutesSinceMidnight: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])) as Record<string, string>;
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  const minutesSinceMidnight = Number.parseInt(map.hour, 10) * 60 + Number.parseInt(map.minute, 10);
  return { dateKey, minutesSinceMidnight };
}

@Injectable()
export class ControllingWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftplan: ShiftplanService,
  ) {}

  async getPolicy() {
    let row = await this.prisma.controllingPolicy.findUnique({ where: { id: "singleton" } });
    if (!row) {
      row = await this.prisma.controllingPolicy.create({ data: { id: "singleton", liveBlockMinutes: 30 } });
    }
    return row;
  }

  async setPolicy(liveBlockMinutes: number) {
    return this.prisma.controllingPolicy.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", liveBlockMinutes },
      update: { liveBlockMinutes },
    });
  }

  async orgFilterTree(user: RequestUser) {
    const abteilungWhere: Prisma.AbteilungWhereInput = { active: true };
    if (user.role !== "ADMIN" && user.allowedProjectIds) {
      const scopedProjects = await this.prisma.project.findMany({
        where: { id: { in: user.allowedProjectIds }, active: true },
        select: { abteilungId: true },
      });
      const abtIds = [...new Set(scopedProjects.map((p) => p.abteilungId))];
      if (abtIds.length === 0) {
        return { abteilungen: [] as Array<{ id: string; name: string; dienstleisterId: string }>, projects: [] as Array<{ id: string; name: string; abteilungId: string }> };
      }
      abteilungWhere.id = { in: abtIds };
    }
    const abteilungen = await this.prisma.abteilung.findMany({
      where: abteilungWhere,
      select: { id: true, name: true, dienstleisterId: true },
      orderBy: { name: "asc" },
    });
    const projectWhere: Prisma.ProjectWhereInput = { active: true };
    if (user.role !== "ADMIN" && user.allowedProjectIds) {
      projectWhere.id = { in: user.allowedProjectIds };
    }
    const projects = await this.prisma.project.findMany({
      where: projectWhere,
      select: { id: true, name: true, abteilungId: true },
      orderBy: { name: "asc" },
    });
    return { abteilungen, projects };
  }

  async createSession(
    user: RequestUser,
    body: { date: string; abteilungId?: string | null; projectId: string; teamIds: string[] },
  ) {
    await this.assertProjectVisible(user, body.projectId);
    const teams = await this.shiftplan.listTeamsByProject(body.projectId, user);
    const allowed = new Set(teams.map((t) => t.id));
    for (const tid of body.teamIds) {
      if (!allowed.has(tid)) {
        throw new BadRequestException(`Team ${tid} is not part of this project or not visible`);
      }
    }
    if (body.abteilungId) {
      const project = await this.prisma.project.findUnique({ where: { id: body.projectId }, select: { abteilungId: true } });
      if (!project || project.abteilungId !== body.abteilungId) {
        throw new BadRequestException("Project does not belong to the selected Abteilung");
      }
    }
    return this.prisma.controllingSession.create({
      data: {
        createdByUserId: user.id,
        date: body.date,
        abteilungId: body.abteilungId ?? null,
        projectId: body.projectId,
        teamIds: body.teamIds as Prisma.InputJsonValue,
      },
    });
  }

  async getSessionBoard(sessionId: string, user: RequestUser, dateOverride?: string) {
    const session = await this.prisma.controllingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (user.role !== "ADMIN" && session.createdByUserId !== user.id) {
      throw new ForbiddenException("You can only open your own sessions");
    }
    await this.assertProjectVisible(user, session.projectId ?? "");
    if (!session.projectId) throw new BadRequestException("Session has no project");

    const date = dateOverride ?? session.date;
    const teamIds = session.teamIds as string[];
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT", teamId: { in: teamIds }, active: true, deletedAt: null },
      select: { id: true, fullName: true, email: true, teamId: true },
      orderBy: { fullName: "asc" },
    });
    const agentIds = agents.map((a) => a.id);
    const policy = await this.getPolicy();
    const { dateKey, minutesSinceMidnight } = berlinCalendarParts();
    const blocksPerDay = Math.floor((24 * 60) / policy.liveBlockMinutes);
    const currentBlockIndex = Math.floor(minutesSinceMidnight / policy.liveBlockMinutes);
    const isTodayBerlin = date === dateKey;
    const editable = isTodayBerlin && currentBlockIndex >= 0 && currentBlockIndex < blocksPerDay;

    const observations = await this.prisma.controllingLiveObservation.findMany({
      where: { date, agentId: { in: agentIds } },
      orderBy: [{ agentId: "asc" }, { blockIndex: "asc" }],
    });
    const byAgent = new Map<string, typeof observations>();
    for (const o of observations) {
      const list = byAgent.get(o.agentId) ?? [];
      list.push(o);
      byAgent.set(o.agentId, list);
    }

    const rows = agents.map((a) => {
      const obs = byAgent.get(a.id) ?? [];
      const current = date === dateKey ? obs.find((o) => o.blockIndex === currentBlockIndex) : undefined;
      return {
        ...a,
        observationsToday: obs.map((o) => ({
          blockIndex: o.blockIndex,
          code: o.code,
          blockMinutesSnapshot: o.blockMinutesSnapshot,
        })),
        currentBlockCode: current?.code ?? null,
      };
    });

    return {
      session: { id: session.id, date: session.date, projectId: session.projectId, teamIds, createdAt: session.createdAt },
      policy: { liveBlockMinutes: policy.liveBlockMinutes },
      timeInfo: {
        berlinDate: dateKey,
        requestedDate: date,
        currentBlockIndex,
        blocksPerDay,
        liveBlockMinutes: policy.liveBlockMinutes,
        editableForCurrentBlock: editable,
      },
      agents: rows,
    };
  }

  async upsertLiveObservation(
    user: RequestUser,
    body: { sessionId: string; agentId: string; date: string; blockIndex: number; code: ControllingLiveCode },
  ) {
    const session = await this.prisma.controllingSession.findUnique({ where: { id: body.sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (user.role !== "ADMIN" && session.createdByUserId !== user.id) {
      throw new ForbiddenException("You can only post into your own sessions");
    }
    const policy = await this.getPolicy();
    const blocksPerDay = Math.floor((24 * 60) / policy.liveBlockMinutes);
    if (body.blockIndex < 0 || body.blockIndex >= blocksPerDay) {
      throw new BadRequestException(`blockIndex must be between 0 and ${blocksPerDay - 1} for the current policy`);
    }
    const { dateKey, minutesSinceMidnight } = berlinCalendarParts();
    const currentBlockIndex = Math.floor(minutesSinceMidnight / policy.liveBlockMinutes);
    if (body.date !== dateKey || body.blockIndex !== currentBlockIndex) {
      throw new ForbiddenException("Nur der aktuelle Live-Block (Europe/Berlin) darf bearbeitet werden.");
    }

    const teamIds = session.teamIds as string[];
    const agent = await this.prisma.user.findUnique({
      where: { id: body.agentId },
      select: { id: true, role: true, teamId: true, active: true, deletedAt: true },
    });
    if (!agent || agent.role !== "AGENT" || !agent.active || agent.deletedAt) {
      throw new BadRequestException("Invalid agent");
    }
    if (!agent.teamId || !teamIds.includes(agent.teamId)) {
      throw new ForbiddenException("Agent is not part of this session's teams");
    }
    await this.assertAgentInUserProjects(user, body.agentId);

    return this.prisma.controllingLiveObservation.upsert({
      where: { agentId_date_blockIndex: { agentId: body.agentId, date: body.date, blockIndex: body.blockIndex } },
      create: {
        sessionId: session.id,
        agentId: body.agentId,
        date: body.date,
        blockIndex: body.blockIndex,
        code: body.code,
        createdByUserId: user.id,
        blockMinutesSnapshot: policy.liveBlockMinutes,
      },
      update: {
        code: body.code,
        sessionId: session.id,
        createdByUserId: user.id,
        blockMinutesSnapshot: policy.liveBlockMinutes,
      },
    });
  }

  async l2Board(projectId: string, date: string, user: RequestUser) {
    await this.assertProjectVisible(user, projectId);
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT", active: true, deletedAt: null, team: { projectId } },
      select: { id: true, fullName: true, email: true, teamId: true, team: { select: { id: true, name: true } } },
      orderBy: { fullName: "asc" },
    });
    const agentIds = agents.map((a) => a.id);
    const [obsGroups, days] = await Promise.all([
      this.prisma.controllingLiveObservation.groupBy({
        by: ["agentId"],
        where: { date, agentId: { in: agentIds } },
        _count: { _all: true },
      }),
      this.prisma.controllingAgentDay.findMany({ where: { date, agentId: { in: agentIds } } }),
    ]);
    const obsCount = new Map(obsGroups.map((g) => [g.agentId, g._count._all]));
    const dayByAgent = new Map(days.map((d) => [d.agentId, d]));
    return {
      date,
      projectId,
      rows: agents.map((a) => ({
        agent: { id: a.id, fullName: a.fullName, email: a.email, teamId: a.teamId, teamName: a.team?.name ?? null },
        liveObservationCount: obsCount.get(a.id) ?? 0,
        agentDay: dayByAgent.get(a.id) ?? null,
      })),
    };
  }

  async setL2Decision(user: RequestUser, agentId: string, date: string, released: boolean, note?: string) {
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, role: true, teamId: true, team: { select: { projectId: true } } },
    });
    if (!agent || agent.role !== "AGENT" || !agent.teamId || !agent.team) throw new BadRequestException("Invalid agent");
    await this.assertProjectVisible(user, agent.team.projectId);

    return this.prisma.controllingAgentDay.upsert({
      where: { agentId_date: { agentId, date } },
      create: {
        agentId,
        date,
        l2Released: released,
        l2Note: note ?? null,
        l2ReviewerId: user.id,
        l2DecidedAt: new Date(),
      },
      update: {
        l2Released: released,
        l2Note: note ?? null,
        l2ReviewerId: user.id,
        l2DecidedAt: new Date(),
      },
    });
  }

  async finalBoard(projectId: string, date: string, user: RequestUser) {
    await this.assertProjectVisible(user, projectId);
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT", active: true, deletedAt: null, team: { projectId } },
      select: { id: true, fullName: true, email: true, teamId: true, team: { select: { id: true, name: true } } },
      orderBy: { fullName: "asc" },
    });
    const agentIds = agents.map((a) => a.id);
    const [observations, days] = await Promise.all([
      this.prisma.controllingLiveObservation.findMany({
        where: { date, agentId: { in: agentIds } },
        orderBy: [{ agentId: "asc" }, { blockIndex: "asc" }],
      }),
      this.prisma.controllingAgentDay.findMany({ where: { date, agentId: { in: agentIds } } }),
    ]);
    const obsByAgent = new Map<string, typeof observations>();
    for (const o of observations) {
      const list = obsByAgent.get(o.agentId) ?? [];
      list.push(o);
      obsByAgent.set(o.agentId, list);
    }
    const dayByAgent = new Map(days.map((d) => [d.agentId, d]));
    return {
      date,
      projectId,
      rows: agents.map((a) => {
        const obs = obsByAgent.get(a.id) ?? [];
        const agentDay = dayByAgent.get(a.id) ?? null;
        return {
          agent: { id: a.id, fullName: a.fullName, email: a.email, teamId: a.teamId, teamName: a.team?.name ?? null },
          liveObservations: obs.map((o) => ({
            blockIndex: o.blockIndex,
            code: o.code,
            blockMinutesSnapshot: o.blockMinutesSnapshot,
          })),
          agentDay,
          l2Done: agentDay?.l2DecidedAt != null,
          l2Released: agentDay?.l2Released ?? null,
        };
      }),
    };
  }

  async setFinalDecision(user: RequestUser, agentId: string, date: string, hoursDelta: number, note?: string) {
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, role: true, teamId: true, team: { select: { projectId: true } } },
    });
    if (!agent || agent.role !== "AGENT" || !agent.teamId || !agent.team) throw new BadRequestException("Invalid agent");
    await this.assertProjectVisible(user, agent.team.projectId);

    return this.prisma.controllingAgentDay.upsert({
      where: { agentId_date: { agentId, date } },
      create: {
        agentId,
        date,
        finalHoursDelta: hoursDelta,
        finalNote: note ?? null,
        finalReviewerId: user.id,
        finalDecidedAt: new Date(),
      },
      update: {
        finalHoursDelta: hoursDelta,
        finalNote: note ?? null,
        finalReviewerId: user.id,
        finalDecidedAt: new Date(),
      },
    });
  }

  private async assertProjectVisible(user: RequestUser, projectId: string) {
    if (!projectId) throw new BadRequestException("projectId required");
    if (user.role === "ADMIN" || !user.allowedProjectIds) return;
    if (!user.allowedProjectIds.includes(projectId)) {
      throw new ForbiddenException("Project not permitted for this account");
    }
  }

  private async assertAgentInUserProjects(user: RequestUser, agentId: string) {
    if (user.role === "ADMIN" || !user.allowedProjectIds) return;
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { team: { select: { projectId: true } } },
    });
    const pid = agent?.team?.projectId;
    if (!pid || !user.allowedProjectIds.includes(pid)) {
      throw new ForbiddenException("Agent is outside your permitted projects");
    }
  }
}
