import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { CalendarBatchBookingDto, CalendarBookingDto, ShiftBlock } from "@ess/shared";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.validateBooking(dto);
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

  listHistory(agentId: string, month: string) {
    return this.prisma.calendarHistory.findMany({
      where: { agentId, date: { startsWith: month } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  private async validateBooking(dto: CalendarBookingDto) {
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const bookingType = await this.prisma.bookingType.findFirst({
      where: { id: dto.bookingTypeId, active: true },
    });
    if (!bookingType) throw new BadRequestException("Booking type not allowed");

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

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

// Helper type re-exported for future imports
export type { ShiftBlock };
