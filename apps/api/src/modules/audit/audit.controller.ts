import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { unparse } from "papaparse";
import type { AppViewKey, UserRole } from "@ess/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuditService } from "./audit.service";

const AUDIT_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN"],
  anyViews: ["admin_audit"],
};

@Controller("audit")
@UseGuards(JwtAuthGuard, RolesGuard)
@Access(AUDIT_ACCESS)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query("actor") actor?: string,
    @Query("resource") resource?: string,
    @Query("action") action?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    return this.audit.list({
      actorUserId: actor,
      resource,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: take ? Number.parseInt(take, 10) : 100,
      skip: skip ? Number.parseInt(skip, 10) : 0,
    });
  }

  @Get("export.csv")
  async exportCsv(
    @Res({ passthrough: false }) res: Response,
    @Query("actor") actor?: string,
    @Query("resource") resource?: string,
    @Query("action") action?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const data = await this.audit.list({
      actorUserId: actor,
      resource,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: 10000,
    });
    const rows = data.items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt.toISOString(),
      actor: item.actor?.email ?? "",
      action: item.action,
      resource: item.resource,
      resourceId: item.resourceId ?? "",
      payload: item.payload ? JSON.stringify(item.payload) : "",
    }));
    const csv = unparse(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=audit.csv");
    res.send(csv);
  }
}
