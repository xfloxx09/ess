import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import type { CalendarBatchBookingDto, CalendarBookingDto, ShiftBlock } from "@ess/shared";
import { PrismaService } from "../../common/prisma.service";
import type { RequestUser } from "../../common/authz.types";
import { ShiftplanBookingRulesService } from "../shiftplan-booking-rules/shiftplan-booking-rules.service";
import { ShiftplanService } from "../shiftplan/shiftplan.service";

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingRules: ShiftplanBookingRulesService,
    private readonly shiftplan: ShiftplanService,
  ) {}

  listActiveBookingTypes() {
    return this.prisma.bookingType.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  }

  async getPolicy() {
    const policy = await this.prisma.calendarPolicy.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
    return policy;
  }

  async book(agentId: string, dto: CalendarBookingDto, expectedVersion?: number) {
    await this.validateBooking(agentId, dto);
    const existing = await this.prisma.calendarBooking.findUnique({
      where: { agentId_date: { agentId, date: dto.date } },
    });
    if (existing) {
      if (expectedVersion !== undefined && expectedVersion !== existing.version) {
        throw new ConflictException("Booking was changed by another update. Reload and retry.");
      }
      const updated = await this.prisma.calendarBooking.update({
        where: { id: existing.id },
        data: { bookingTypeId: dto.bookingTypeId, blocks: dto.blocks, version: { increment: 1 } },
      });
      await this.prisma.calendarHistory.create({
        data: {
          bookingId: updated.id,
          agentId: updated.agentId,
          date: updated.date,
          action: "UPSERT",
          version: updated.version,
          payload: { bookingTypeId: updated.bookingTypeId, blocks: dto.blocks },
        },
      });
      return updated;
    }
    const created = await this.prisma.calendarBooking.create({
      data: { agentId, date: dto.date, bookingTypeId: dto.bookingTypeId, blocks: dto.blocks, version: 1 },
    });
    await this.prisma.calendarHistory.create({
      data: {
        bookingId: created.id,
        agentId,
        date: created.date,
        action: "UPSERT",
        version: 1,
        payload: { bookingTypeId: dto.bookingTypeId, blocks: dto.blocks },
      },
    });
    return created;
  }

  async bookBatch(agentId: string, dto: CalendarBatchBookingDto) {
    const policy = await this.getPolicy();
    if (!policy.allowMultiDayBooking) {
      throw new BadRequestException("Multi-day booking is disabled by admin policy");
    }
    const results: Awaited<ReturnType<typeof this.book>>[] = [];
    for (const date of dto.dates) {
      results.push(await this.book(agentId, { date, bookingTypeId: dto.bookingTypeId, blocks: dto.blocks }));
    }
    return results;
  }

  listMine(agentId: string, month: string) {
    return this.prisma.calendarBooking.findMany({
      where: { agentId, date: { startsWith: month } },
      orderBy: { date: "asc" },
    });
  }

  /**
   * Urlaub / Frei / Krank usw. als **eine** Kalenderzeile pro Tag — ohne Agenten-Vorlauf- und Buchungsfenster-Prüfungen.
   * Optional werden alle Schichtplan-Zellen des Tages geleert (kein F/U in jedem Viertelstundenfeld).
   */
  async bookForPlanner(
    actor: RequestUser,
    input: { agentId: string; date: string; bookingTypeId: string; clearShiftplanDay?: boolean; expectedVersion?: number },
  ) {
    await this.assertPlannerMaySetBooking(actor, input.agentId);
    const bookingType = await this.prisma.bookingType.findFirst({
      where: { id: input.bookingTypeId, active: true },
    });
    if (!bookingType) throw new BadRequestException("Buchungsart nicht gefunden oder inaktiv.");
    if (!plannerBookingAllowsEmptyBlocks(bookingType)) {
      throw new BadRequestException(
        "Diese Buchungsart braucht Uhrzeit-Blöcke (z. B. Früh/Spät). Bitte im Agenten-Kalender buchen oder Blöcke später ergänzen.",
      );
    }

    const dto: CalendarBookingDto = { date: input.date, bookingTypeId: input.bookingTypeId, blocks: [] };
    const existing = await this.prisma.calendarBooking.findUnique({
      where: { agentId_date: { agentId: input.agentId, date: dto.date } },
    });
    if (existing) {
      if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
        throw new ConflictException("Booking was changed by another update. Reload and retry.");
      }
      const updated = await this.prisma.calendarBooking.update({
        where: { id: existing.id },
        data: { bookingTypeId: dto.bookingTypeId, blocks: dto.blocks, version: { increment: 1 } },
      });
      await this.prisma.calendarHistory.create({
        data: {
          bookingId: updated.id,
          agentId: updated.agentId,
          date: updated.date,
          action: "UPSERT",
          version: updated.version,
          payload: { bookingTypeId: updated.bookingTypeId, blocks: dto.blocks, source: "planner" },
        },
      });
      await this.maybeClearShiftplanDay(actor, input.agentId, dto.date, input.clearShiftplanDay !== false);
      return updated;
    }
    const created = await this.prisma.calendarBooking.create({
      data: { agentId: input.agentId, date: dto.date, bookingTypeId: dto.bookingTypeId, blocks: dto.blocks, version: 1 },
    });
    await this.prisma.calendarHistory.create({
      data: {
        bookingId: created.id,
        agentId: input.agentId,
        date: dto.date,
        action: "UPSERT",
        version: 1,
        payload: { bookingTypeId: dto.bookingTypeId, blocks: dto.blocks, source: "planner" },
      },
    });
    await this.maybeClearShiftplanDay(actor, input.agentId, dto.date, input.clearShiftplanDay !== false);
    return created;
  }

  async removePlannerBooking(actor: RequestUser, input: { agentId: string; date: string }) {
    await this.assertPlannerMaySetBooking(actor, input.agentId);
    const target = await this.prisma.calendarBooking.findUnique({
      where: { agentId_date: { agentId: input.agentId, date: input.date } },
    });
    if (!target) return { removed: 0 };
    await this.prisma.calendarHistory.create({
      data: {
        bookingId: target.id,
        agentId: input.agentId,
        date: input.date,
        action: "DELETE",
        version: target.version,
        payload: { bookingTypeId: target.bookingTypeId, blocks: target.blocks ?? [], source: "planner" },
      },
    });
    await this.prisma.calendarBooking.delete({ where: { id: target.id } });
    return { removed: 1 };
  }

  private async maybeClearShiftplanDay(actor: RequestUser, agentId: string, date: string, doClear: boolean) {
    if (!doClear) return;
    const all = Array.from({ length: 96 }, (_, i) => i);
    await this.shiftplan.bulkClearSlots({ agentId, date, slotIndices: all }, actor);
  }

  private async assertPlannerMaySetBooking(actor: RequestUser, agentId: string) {
    if (actor.role === "ADMIN") return;
    if (actor.role !== "CONTROLLING" && actor.role !== "SCHICHTPLANUNG") {
      throw new ForbiddenException("Nur Controlling, Schichtplanung oder Admin.");
    }
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { role: true, teamId: true },
    });
    if (!agent || agent.role !== "AGENT") throw new BadRequestException("Nur für Agenten-Kalender.");
    if (!agent.teamId) throw new ForbiddenException("Agent ohne Team.");
    const team = await this.prisma.team.findUnique({ where: { id: agent.teamId }, select: { projectId: true } });
    if (!team) throw new ForbiddenException("Team nicht gefunden.");
    if (actor.allowedProjectIds && !actor.allowedProjectIds.includes(team.projectId)) {
      throw new ForbiddenException("Projekt für dieses Konto nicht freigeschaltet.");
    }
  }

  async removeMine(agentId: string, date: string, expectedVersion?: number) {
    const target = await this.prisma.calendarBooking.findUnique({ where: { agentId_date: { agentId, date } } });
    if (!target) return { removed: 0 };
    if (expectedVersion !== undefined && expectedVersion !== target.version) {
      throw new ConflictException("Booking was changed by another update. Reload and retry.");
    }
    await this.prisma.calendarHistory.create({
      data: {
        bookingId: target.id,
        agentId,
        date,
        action: "DELETE",
        version: target.version,
        payload: { bookingTypeId: target.bookingTypeId, blocks: target.blocks ?? [] },
      },
    });
    await this.prisma.calendarBooking.delete({ where: { id: target.id } });
    return { removed: 1 };
  }

  myBookingMonthSummary(agentId: string, month: string) {
    return this.bookingRules.getMyBookingMonthSummary(agentId, month);
  }

  listHistory(agentId: string, month: string) {
    return this.prisma.calendarHistory.findMany({
      where: { agentId, date: { startsWith: month } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  private async validateBooking(agentId: string, dto: CalendarBookingDto) {
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const bookingType = await this.prisma.bookingType.findFirst({
      where: { id: dto.bookingTypeId, active: true },
    });
    if (!bookingType) throw new BadRequestException("Booking type not allowed");

    await this.bookingRules.assertCalendarBookingAllowed(agentId, dto.date, dto.bookingTypeId, bookingType.code);

    if (!bookingType.allowsSplitShift && dto.blocks.length > 1) {
      throw new BadRequestException("This booking type does not allow split shift blocks");
    }
    if (bookingType.code === "SPLIT" && dto.blocks.length !== 2) {
      throw new BadRequestException("Split shift requires exactly 2 blocks");
    }

    const policy = await this.getPolicy();
    const isCurrentMonth = dto.date.startsWith(currentMonth);

    if (bookingType.code === "U") {
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + policy.normalVacationLeadDays);
      const minDateKey = minDate.toISOString().slice(0, 10);
      if (dto.date < minDateKey) {
        throw new BadRequestException(`Normal vacation must be booked at least ${policy.normalVacationLeadDays} days in advance`);
      }
      if (isCurrentMonth && !policy.allowNormalVacationCurrentMonth) {
        throw new BadRequestException("Normal vacation in current month is disabled by policy");
      }
    }

    if (bookingType.code === "UK" && !isCurrentMonth) {
      throw new BadRequestException("Short-notice vacation can only be booked in current month");
    }

    const targetMonth = dto.date.slice(0, 7);
    const window = await this.prisma.bookingWindow.findUnique({ where: { month: targetMonth } });
    if (window && bookingType.code !== "K") {
      const opens = new Date(window.opensAtIso).getTime();
      const closes = new Date(window.closesAtIso).getTime();
      const current = now.getTime();
      if (current < opens || current > closes) {
        throw new BadRequestException("Booking window closed");
      }
    }

    if (dto.blocks.length === 2) {
      const rule = await this.prisma.shiftRule.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } });
      if (rule) {
        const firstHours = hoursBetween(dto.blocks[0].start, dto.blocks[0].end);
        const secondHours = hoursBetween(dto.blocks[1].start, dto.blocks[1].end);
        const pauseHours = hoursBetween(dto.blocks[0].end, dto.blocks[1].start);
        if (firstHours < rule.minFirstHours || firstHours > rule.maxFirstHours) {
          throw new BadRequestException("First split block violates rule");
        }
        if (pauseHours < rule.minPauseHours || pauseHours > rule.maxPauseHours) {
          throw new BadRequestException("Split pause violates rule");
        }
        if (secondHours < rule.minSecondHours || secondHours > rule.maxSecondHours) {
          throw new BadRequestException("Second split block violates rule");
        }
      }
    }

    const lockCurrentMonth = bookingType.code !== "UK" && bookingType.code !== "K" && bookingType.code !== "U";
    if (lockCurrentMonth && dto.date.startsWith(currentMonth)) {
      throw new BadRequestException("Current month is locked for this booking type");
    }
  }
}

function plannerBookingAllowsEmptyBlocks(bt: { category: string; code: string; allowsSplitShift: boolean }): boolean {
  if (bt.allowsSplitShift) return false;
  if (bt.category === "VACATION" || bt.category === "SICK") return true;
  if (bt.category === "SHIFT" && !["FR", "SN", "SPLIT"].includes(bt.code)) return true;
  return false;
}

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

// Helper type re-exported for future imports
export type { ShiftBlock };
