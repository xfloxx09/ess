import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AppViewKey, UserRole } from "@ess/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ReportsService } from "./reports.service";

const REPORTS_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["controlling_reports", "controlling_review"],
};

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Access(REPORTS_ACCESS)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("kpi.csv")
  async kpiCsv(@Query("month") month: string, @Res({ passthrough: false }) res: Response) {
    const csv = await this.reports.kpiCsv(month);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=kpi-${month}.csv`);
    res.send(csv);
  }

  @Get("kpi.pdf")
  async kpiPdf(@Query("month") month: string, @Res({ passthrough: false }) res: Response) {
    const buffer = await this.reports.kpiPdf(month);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=kpi-${month}.pdf`);
    res.send(buffer);
  }

  @Get("roster-month.csv")
  async rosterMonthCsv(
    @Query("projectId") projectId: string,
    @Query("month") month: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const csv = await this.reports.rosterMonthCsv(projectId, month);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=roster-${month}.csv`);
    res.send(csv);
  }
}
