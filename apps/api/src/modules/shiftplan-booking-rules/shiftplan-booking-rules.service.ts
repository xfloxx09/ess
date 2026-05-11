import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma, ShiftplanMonthAgentVisibility } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class ShiftplanBookingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentProjectId(agentId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { teamId: true },
    });
    if (!user?.teamId) return null;
    const team = await this.prisma.team.findUnique({
      where: { id: user.teamId },
      select: { projectId: true },
    });
    return team?.projectId ?? null;
  }

  /**
   * Throws when project rules disallow this booking (sick "K" exempt from day/month closures only).
   */
  async assertCalendarBookingAllowed(agentId: string, date: string, bookingTypeId: string, bookingTypeCode: string): Promise<void> {
    const projectId = await this.getAgentProjectId(agentId);
    if (!projectId) return;

    const sickExempt = bookingTypeCode === "K";
    const month = date.slice(0, 7);

    const monthCfg = await this.prisma.projectShiftplanMonthConfig.findUnique({
      where: { projectId_month: { projectId, month } },
    });
    const monthOpen = monthCfg?.calendarBookingOpen ?? true;

    const dayOv = await this.prisma.projectCalendarDayOverride.findUnique({
      where: { projectId_date: { projectId, date } },
    });
    const effectiveOpen = dayOv !== null ? dayOv.calendarBookingOpen : monthOpen;

    if (!effectiveOpen && !sickExempt) {
      throw new BadRequestException("Kalenderbuchung für diesen Tag ist geschlossen.");
    }

    const blockedTypes = await this.prisma.projectBookingTypeBlock.findMany({
      where: {
        projectId,
        bookingTypeId,
        OR: [{ date }, { AND: [{ month }, { date: null }] }],
      },
      take: 5,
    });
    if (blockedTypes.length > 0) {
      throw new BadRequestException("Diese Buchungsart ist für den Zeitraum gesperrt.");
    }
  }

  async getAgentShiftplanVisibilityForMonth(agentId: string, month: string): Promise<ShiftplanMonthAgentVisibility> {
    const projectId = await this.getAgentProjectId(agentId);
    if (!projectId) return "PUBLISHED";
    const cfg = await this.prisma.projectShiftplanMonthConfig.findUnique({
      where: { projectId_month: { projectId, month } },
    });
    return cfg?.agentShiftplanVisibility ?? "PUBLISHED";
  }

  async getRulesBundle(projectId: string, month: string) {
    const [monthConfig, dayOverrides, typeBlocks, bookingTypes, projectProfile] = await Promise.all([
      this.prisma.projectShiftplanMonthConfig.findUnique({ where: { projectId_month: { projectId, month } } }),
      this.prisma.projectCalendarDayOverride.findMany({
        where: { projectId, date: { startsWith: month } },
        orderBy: { date: "asc" },
      }),
      this.prisma.projectBookingTypeBlock.findMany({
        where: {
          projectId,
          OR: [{ date: { startsWith: month } }, { month }],
        },
        include: { bookingType: { select: { id: true, label: true, code: true } } },
        orderBy: [{ date: "asc" }, { month: "asc" }],
      }),
      this.prisma.bookingType.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { shiftplanTargetDayMinutes: true, shiftplanPausePatternJson: true },
      }),
    ]);
    return {
      monthConfig,
      dayOverrides,
      typeBlocks,
      bookingTypes,
      planner: projectProfile
        ? {
            shiftplanTargetDayMinutes: projectProfile.shiftplanTargetDayMinutes,
            shiftplanPausePatternJson: projectProfile.shiftplanPausePatternJson,
          }
        : { shiftplanTargetDayMinutes: 480, shiftplanPausePatternJson: null },
    };
  }

  async upsertMonthConfig(input: {
    projectId: string;
    month: string;
    calendarBookingOpen: boolean;
    agentShiftplanVisibility: ShiftplanMonthAgentVisibility;
  }) {
    return this.prisma.projectShiftplanMonthConfig.upsert({
      where: { projectId_month: { projectId: input.projectId, month: input.month } },
      create: {
        projectId: input.projectId,
        month: input.month,
        calendarBookingOpen: input.calendarBookingOpen,
        agentShiftplanVisibility: input.agentShiftplanVisibility,
      },
      update: {
        calendarBookingOpen: input.calendarBookingOpen,
        agentShiftplanVisibility: input.agentShiftplanVisibility,
      },
    });
  }

  async upsertDayOverride(input: { projectId: string; date: string; calendarBookingOpen: boolean }) {
    return this.prisma.projectCalendarDayOverride.upsert({
      where: { projectId_date: { projectId: input.projectId, date: input.date } },
      create: {
        projectId: input.projectId,
        date: input.date,
        calendarBookingOpen: input.calendarBookingOpen,
      },
      update: { calendarBookingOpen: input.calendarBookingOpen },
    });
  }

  async deleteDayOverride(projectId: string, date: string) {
    await this.prisma.projectCalendarDayOverride.deleteMany({ where: { projectId, date } });
  }

  async addBookingTypeBlock(input: { projectId: string; bookingTypeId: string; month?: string | null; date?: string | null }) {
    if (!input.month && !input.date) {
      throw new BadRequestException("Monat oder Datum für die Sperre angeben.");
    }
    return this.prisma.projectBookingTypeBlock.create({
      data: {
        projectId: input.projectId,
        bookingTypeId: input.bookingTypeId,
        month: input.month ?? null,
        date: input.date ?? null,
      },
      include: { bookingType: { select: { id: true, label: true, code: true } } },
    });
  }

  async deleteBookingTypeBlock(id: string, projectId: string) {
    await this.prisma.projectBookingTypeBlock.deleteMany({ where: { id, projectId } });
  }

  async deleteMonthConfig(projectId: string, month: string) {
    await this.prisma.projectShiftplanMonthConfig.deleteMany({ where: { projectId, month } });
  }

  async upsertProjectPlannerSettings(input: {
    projectId: string;
    shiftplanTargetDayMinutes?: number;
    shiftplanPausePattern?: Array<{ workMinutes: number; pauseMinutes: number }>;
  }) {
    const data: Prisma.ProjectUpdateInput = {};
    if (input.shiftplanTargetDayMinutes !== undefined) {
      data.shiftplanTargetDayMinutes = input.shiftplanTargetDayMinutes;
    }
    if (input.shiftplanPausePattern !== undefined) {
      data.shiftplanPausePatternJson = input.shiftplanPausePattern;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Keine Felder zum Speichern.");
    }
    return this.prisma.project.update({ where: { id: input.projectId }, data });
  }

  /** Resolved flags for agent calendar UI (month scope). */
  async getMyBookingMonthSummary(agentId: string, month: string) {
    const projectId = await this.getAgentProjectId(agentId);
    if (!projectId) {
      return {
        projectId: null as string | null,
        monthDefaultOpen: true,
        shiftplanVisibility: "PUBLISHED" as ShiftplanMonthAgentVisibility,
        dayOverrides: [] as Array<{ date: string; calendarBookingOpen: boolean }>,
        blockedBookingTypeIds: [] as string[],
      };
    }
    const bundle = await this.getRulesBundle(projectId, month);
    const monthOpen = bundle.monthConfig?.calendarBookingOpen ?? true;
    const vis = bundle.monthConfig?.agentShiftplanVisibility ?? "PUBLISHED";
    const blockedIds = new Set<string>();
    for (const b of bundle.typeBlocks) {
      if (b.date && b.date.startsWith(month)) blockedIds.add(b.bookingTypeId);
      else if (b.month === month && !b.date) blockedIds.add(b.bookingTypeId);
    }
    return {
      projectId,
      monthDefaultOpen: monthOpen,
      shiftplanVisibility: vis,
      dayOverrides: bundle.dayOverrides.map((d) => ({ date: d.date, calendarBookingOpen: d.calendarBookingOpen })),
      blockedBookingTypeIds: [...blockedIds],
    };
  }
}
