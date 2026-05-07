import { Injectable, NotFoundException } from "@nestjs/common";
import type { BookingCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [teams, projects, products, premiums, bookingTypes, bookingWindows, shiftRules, rateTables, quarterHourCodes, calendarPolicy] = await Promise.all([
      this.prisma.team.findMany({ orderBy: { name: "asc" } }),
      this.prisma.project.findMany({ orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      this.prisma.productPremium.findMany(),
      this.prisma.bookingType.findMany({ orderBy: { code: "asc" } }),
      this.prisma.bookingWindow.findMany({ orderBy: { month: "asc" } }),
      this.prisma.shiftRule.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
      this.prisma.rateTable.findMany(),
      this.prisma.quarterHourCode.findMany({ orderBy: { code: "asc" } }),
      this.prisma.calendarPolicy.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} }),
    ]);
    return { teams, projects, products, premiums, bookingTypes, bookingWindows, shiftRules, rateTables, quarterHourCodes, calendarPolicy };
  }

  async upsertProject(name: string, abteilungId?: string) {
    const existing = await this.prisma.project.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) return existing;
    const abteilung = abteilungId
      ? await this.prisma.abteilung.findUnique({ where: { id: abteilungId } })
      : await this.prisma.abteilung.findFirst({ orderBy: { name: "asc" } });
    if (!abteilung) {
      throw new NotFoundException("No Abteilung exists yet. Create one under Admin → Organisation first.");
    }
    return this.prisma.project.create({ data: { name, abteilungId: abteilung.id } });
  }

  async upsertProduct(name: string, category?: string) {
    const existing = await this.prisma.product.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deletedAt: null } });
    if (existing) {
      if (category) return this.prisma.product.update({ where: { id: existing.id }, data: { category } });
      return existing;
    }
    return this.prisma.product.create({ data: { name, category: category ?? "General" } });
  }

  async setPremium(projectId: string, productId: string, amountEuro: number) {
    return this.prisma.productPremium.upsert({
      where: { projectId_productId: { projectId, productId } },
      create: { projectId, productId, amountEuro },
      update: { amountEuro },
    });
  }

  async upsertBookingType(input: {
    id?: string;
    label: string;
    code: string;
    category: BookingCategory;
    emoji?: string;
    color: string;
    allowsSplitShift: boolean;
    active: boolean;
  }) {
    if (input.id) {
      return this.prisma.bookingType.update({
        where: { id: input.id },
        data: {
          label: input.label,
          code: input.code,
          category: input.category,
          emoji: input.emoji,
          color: input.color,
          allowsSplitShift: input.allowsSplitShift,
          active: input.active,
        },
      });
    }
    return this.prisma.bookingType.create({
      data: {
        label: input.label,
        code: input.code,
        category: input.category,
        emoji: input.emoji,
        color: input.color,
        allowsSplitShift: input.allowsSplitShift,
        active: input.active,
      },
    });
  }

  setBookingWindow(month: string, opensAtIso: string, closesAtIso: string) {
    return this.prisma.bookingWindow.upsert({
      where: { month },
      create: { month, opensAtIso, closesAtIso },
      update: { opensAtIso, closesAtIso },
    });
  }

  async setCalendarPolicy(input: { normalVacationLeadDays: number; allowNormalVacationCurrentMonth: boolean; allowMultiDayBooking?: boolean }) {
    return this.prisma.calendarPolicy.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...input },
      update: input,
    });
  }

  async setShiftRule(rule: { minFirstHours: number; maxFirstHours: number; minPauseHours: number; maxPauseHours: number; minSecondHours: number; maxSecondHours: number }) {
    await this.prisma.shiftRule.updateMany({ where: { active: true }, data: { active: false } });
    return this.prisma.shiftRule.create({ data: { ...rule, active: true } });
  }

  setRate(shiftType: string, euroPerHour: number) {
    return this.prisma.rateTable.upsert({
      where: { shiftType },
      create: { shiftType, euroPerHour },
      update: { euroPerHour },
    });
  }

  upsertQuarterHourCode(input: { id?: string; code: string; label: string; color: string; valueMultiplier: number; active?: boolean }) {
    if (input.id) {
      return this.prisma.quarterHourCode.update({
        where: { id: input.id },
        data: { code: input.code, label: input.label, color: input.color, valueMultiplier: input.valueMultiplier, active: input.active ?? true },
      });
    }
    return this.prisma.quarterHourCode.create({
      data: { code: input.code, label: input.label, color: input.color, valueMultiplier: input.valueMultiplier, active: input.active ?? true },
    });
  }
}
