import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AntragStatus, AntragType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

@Injectable()
export class AntraegeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(input: {
    actorUserId: string;
    agentId: string;
    date: string;
    fromSlot: number;
    toSlot: number;
    type: AntragType;
    note?: string;
  }) {
    const agent = await this.prisma.user.findUnique({ where: { id: input.agentId } });
    if (!agent || agent.role !== "AGENT") throw new BadRequestException("Agent not found");

    const start = Math.max(0, Math.min(input.fromSlot, input.toSlot));
    const end = Math.min(95, Math.max(input.fromSlot, input.toSlot));
    if (start > end) throw new BadRequestException("Invalid slot range");

    const duplicate = await this.prisma.antrag.findFirst({
      where: {
        agentId: input.agentId,
        date: input.date,
        type: input.type,
        fromSlot: start,
        toSlot: end,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (duplicate) throw new BadRequestException("Same Antrag already exists for this slot range");

    const created = await this.prisma.antrag.create({
      data: {
        agentId: input.agentId,
        date: input.date,
        fromSlot: start,
        toSlot: end,
        type: input.type,
        status: "PENDING",
        note: input.note?.trim() || null,
        createdByUserId: input.actorUserId,
      },
    });
    await this.prisma.antragHistory.create({
      data: {
        antragId: created.id,
        agentId: created.agentId,
        action: "CREATED",
        actorUserId: input.actorUserId,
        payload: { type: created.type, fromSlot: created.fromSlot, toSlot: created.toSlot, status: created.status },
      },
    });

    // Notify the agent + emit realtime
    await this.notifications.notify({
      userId: input.agentId,
      kind: "ANTRAG_CREATED",
      title: "Neuer Antrag",
      body: `Antrag ${input.type} für ${input.date}`,
      link: `/agent/calendar?date=${input.date}`,
      payload: { antragId: created.id },
    });
    this.realtime.emit({ type: "antrag.created", antragId: created.id, agentId: created.agentId, date: created.date }, ["org:global"]);

    return created;
  }

  approve(actorUserId: string, id: string) {
    return this.setStatus(actorUserId, id, "APPROVED");
  }

  reject(actorUserId: string, id: string) {
    return this.setStatus(actorUserId, id, "REJECTED");
  }

  private async setStatus(actorUserId: string, id: string, next: AntragStatus) {
    const entry = await this.prisma.antrag.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Antrag not found");
    if (entry.status !== "PENDING") throw new BadRequestException(`Antrag is already ${entry.status}`);
    const updated = await this.prisma.antrag.update({
      where: { id },
      data: { status: next, decidedByUserId: actorUserId, decidedAt: new Date() },
    });
    await this.prisma.antragHistory.create({
      data: {
        antragId: id,
        agentId: entry.agentId,
        action: next === "APPROVED" ? "APPROVED" : "REJECTED",
        actorUserId,
        payload: { type: updated.type, fromSlot: updated.fromSlot, toSlot: updated.toSlot, status: updated.status },
      },
    });

    await this.notifications.notify({
      userId: entry.agentId,
      kind: next === "APPROVED" ? "ANTRAG_APPROVED" : "ANTRAG_REJECTED",
      title: next === "APPROVED" ? "Antrag genehmigt" : "Antrag abgelehnt",
      body: `Antrag für ${entry.date} wurde ${next === "APPROVED" ? "genehmigt" : "abgelehnt"}`,
      link: `/agent/calendar?date=${entry.date}`,
      payload: { antragId: id },
    });
    this.realtime.emit({ type: "antrag.decided", antragId: id, agentId: entry.agentId, date: entry.date, status: next as "APPROVED" | "REJECTED" }, ["org:global"]);

    return updated;
  }

  listMonth(month: string, agentId?: string, status?: AntragStatus) {
    const where: Prisma.AntragWhereInput = { date: { startsWith: month } };
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;
    return this.prisma.antrag.findMany({
      where,
      orderBy: [{ date: "asc" }, { fromSlot: "asc" }],
      include: { agent: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async listHistoryForMonth(month: string, agentId?: string) {
    const antragWhere: Prisma.AntragWhereInput = { date: { startsWith: month } };
    if (agentId) antragWhere.agentId = agentId;
    const ids = (await this.prisma.antrag.findMany({ where: antragWhere, select: { id: true } })).map((r) => r.id);
    if (ids.length === 0) return [];
    return this.prisma.antragHistory.findMany({
      where: { antragId: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
