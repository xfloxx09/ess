import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  async listAgentMonth(agentId: string, month: string) {
    const [shiftCells, bookings, salesEntries, antraegeAll, bookingTypes, premiums, rates, kpiRows] = await Promise.all([
      this.prisma.shiftplanCell.findMany({ where: { agentId, date: { startsWith: month } } }),
      this.prisma.calendarBooking.findMany({ where: { agentId, date: { startsWith: month } } }),
      this.prisma.salesEntry.findMany({ where: { agentId, callDate: { startsWith: month } } }),
      this.prisma.antrag.findMany({ where: { agentId, date: { startsWith: month } } }),
      this.prisma.bookingType.findMany(),
      this.prisma.productPremium.findMany(),
      this.prisma.rateTable.findMany(),
      this.prisma.kpiDailyValue.findMany({ where: { agentId, date: { startsWith: month } } }),
    ]);

    const antraegeApproved = antraegeAll.filter((entry) => entry.status === "APPROVED");
    const bookingMap = new Map(bookings.map((booking) => [booking.date, booking]));
    const dates = datesForMonth(month);
    const kpiByDate = new Map(kpiRows.map((row) => [row.date, row]));

    const days = dates.map((date) => {
      const dayCells = shiftCells.filter((cell) => cell.date === date);
      const approved = dayCells.filter((cell) => cell.controllerCode === cell.rawCode);
      const approvedASlots = approved.filter((cell) => cell.controllerCode === "A").map((cell) => cell.slotIndex);
      const approvedA = approvedASlots.length;
      const approvedP = approved.filter((cell) => cell.controllerCode === "P").length;
      const approvedASet = new Set(approvedASlots);
      const dayApproved = antraegeApproved.filter((a) => a.date === date);
      const paidByAntrag = new Set<number>();
      for (const a of dayApproved) {
        for (let s = a.fromSlot; s <= a.toSlot; s += 1) paidByAntrag.add(s);
      }
      let additionalPaidSlots = 0;
      for (const slot of paidByAntrag) {
        if (!approvedASet.has(slot)) additionalPaidSlots += 1;
      }
      const dayPending = antraegeAll.filter((a) => a.date === date && a.status === "PENDING");
      let antragPendingSlots = 0;
      for (const a of dayPending) antragPendingSlots += a.toSlot - a.fromSlot + 1;

      const minuteIb = approvedA * 15;
      const antragPaidMinutes = additionalPaidSlots * 15;
      const minuteOb = 0;
      const waitMinutes = approvedP * 15;

      const booking = bookingMap.get(date);
      const bookingType = booking ? bookingTypes.find((t) => t.id === booking.bookingTypeId) : undefined;
      const shiftType = bookingType?.code;
      const bookingLabel = bookingType?.label;
      const hourlyRate = resolveRate(rates, shiftType);
      const baseEuro = ((minuteIb + antragPaidMinutes) / 60) * hourlyRate;

      const daySales = salesEntries.filter((e) => e.callDate === date);
      const salesEuro = daySales.reduce((sum, e) => {
        const premium = premiums.find((p) => p.projectId === e.projectId && p.productId === e.productId);
        return sum + (premium?.amountEuro ?? 0) * e.quantity;
      }, 0);

      const importedKpi = kpiByDate.get(date);
      const npsEuro = importedKpi?.npsEuro ?? 0;

      return {
        id: `${agentId}-${date}`,
        date,
        minuteIb: Math.max(minuteIb, importedKpi?.minuteIb ?? 0),
        minuteOb: importedKpi?.minuteOb ?? minuteOb,
        waitMinutes: Math.max(waitMinutes, importedKpi?.waitMinutes ?? 0),
        salesEuro: salesEuro + (importedKpi?.salesEuro ?? 0),
        npsEuro,
        approvedA,
        approvedP,
        antragPaidSlots: additionalPaidSlots,
        antragPaidMinutes,
        antragPaidTypes: Array.from(new Set(dayApproved.map((a) => a.type))),
        antragPendingSlots,
        antragPendingCount: dayPending.length,
        agreedSlots: approved.length,
        disagreedSlots: dayCells.length - approved.length,
        bookingLabel,
        bookingCode: shiftType,
        baseEuro,
        dayEuro: baseEuro + salesEuro + npsEuro,
      };
    });

    const totals = days.reduce(
      (acc, day) => {
        acc.minuteIb += day.minuteIb;
        acc.minuteOb += day.minuteOb;
        acc.waitMinutes += day.waitMinutes;
        acc.antragPaidMinutes += day.antragPaidMinutes;
        acc.antragPendingSlots += day.antragPendingSlots;
        acc.salesEuro += day.salesEuro;
        acc.npsEuro += day.npsEuro;
        acc.baseEuro += day.baseEuro;
        return acc;
      },
      { minuteIb: 0, minuteOb: 0, waitMinutes: 0, antragPaidMinutes: 0, antragPendingSlots: 0, salesEuro: 0, npsEuro: 0, baseEuro: 0 },
    );

    const totalEuro = totals.baseEuro + totals.salesEuro + totals.npsEuro;
    return {
      days,
      totals,
      abrechnung: {
        baseEuro: totals.baseEuro,
        salesEuro: totals.salesEuro,
        npsEuro: totals.npsEuro,
        totalEuro,
      },
    };
  }

  async listOrgMonth(month: string, search?: string) {
    const where: Parameters<typeof this.prisma.user.findMany>[0] = { where: { role: "AGENT", active: true, deletedAt: null } };
    if (search) {
      where.where = {
        ...where.where,
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }
    const agents = await this.prisma.user.findMany({ ...where, orderBy: { fullName: "asc" } });
    const leaderboard = await Promise.all(
      agents.map(async (agent) => {
        const data = await this.listAgentMonth(agent.id, month);
        return {
          agentId: agent.id,
          fullName: agent.fullName,
          email: agent.email,
          totalEuro: data.abrechnung.totalEuro,
          baseEuro: data.abrechnung.baseEuro,
          salesEuro: data.abrechnung.salesEuro,
          npsEuro: data.abrechnung.npsEuro,
          agreedSlots: data.days.reduce((sum, d) => sum + d.agreedSlots, 0),
          disagreedSlots: data.days.reduce((sum, d) => sum + d.disagreedSlots, 0),
        };
      }),
    );
    leaderboard.sort((a, b) => b.totalEuro - a.totalEuro);
    return {
      month,
      leaderboard,
      totals: {
        payoutEuro: leaderboard.reduce((sum, a) => sum + a.totalEuro, 0),
        agreedSlots: leaderboard.reduce((sum, a) => sum + a.agreedSlots, 0),
        disagreedSlots: leaderboard.reduce((sum, a) => sum + a.disagreedSlots, 0),
      },
    };
  }

  async dashboardSummary(month: string) {
    const org = await this.listOrgMonth(month);
    const projects = await this.prisma.project.findMany({ where: { active: true } });
    const sales = await this.prisma.salesEntry.findMany({ where: { callDate: { startsWith: month } } });
    const premiums = await this.prisma.productPremium.findMany();
    const salesByProject = projects.map((p) => {
      const projectSales = sales.filter((s) => s.projectId === p.id);
      const euro = projectSales.reduce((sum, s) => {
        const premium = premiums.find((pm) => pm.projectId === s.projectId && pm.productId === s.productId);
        return sum + (premium?.amountEuro ?? 0) * s.quantity;
      }, 0);
      return { projectId: p.id, projectName: p.name, salesEuro: euro, count: projectSales.length };
    });
    return {
      month,
      payoutEuro: org.totals.payoutEuro,
      agreedSlots: org.totals.agreedSlots,
      disagreedSlots: org.totals.disagreedSlots,
      agreementPct:
        org.totals.agreedSlots + org.totals.disagreedSlots === 0
          ? 100
          : (org.totals.agreedSlots / (org.totals.agreedSlots + org.totals.disagreedSlots)) * 100,
      topAgents: org.leaderboard.slice(0, 10),
      salesByProject,
    };
  }
}

function resolveRate(rates: Array<{ shiftType: string; euroPerHour: number }>, bookingCode: string | undefined) {
  if (!bookingCode) {
    return rates.find((r) => r.shiftType === "FRUEH")?.euroPerHour ?? 12.5;
  }
  if (bookingCode === "SN") {
    return rates.find((r) => r.shiftType === "SPAET")?.euroPerHour ?? 14;
  }
  return rates.find((r) => r.shiftType === "FRUEH")?.euroPerHour ?? 12.5;
}

function datesForMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
