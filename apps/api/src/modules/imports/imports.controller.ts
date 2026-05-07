import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import { importCommitSchema, importDryRunSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ImportsService } from "./imports.service";

const IMPORT_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["controlling_imports"],
};

@Controller("imports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Access(IMPORT_ACCESS)
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly audit: AuditService,
  ) {}

  @Post("dry-run")
  dryRun(@Body(Body$(importDryRunSchema)) body: { fileName: string; csv: string }) {
    return this.imports.dryRun(body.fileName, body.csv);
  }

  @Post("commit")
  async commit(@Req() req: { user: RequestUser }, @Body(Body$(importCommitSchema)) body: { source: string; body: string; kind: "KPI_DAILY" | "SALES" | "GENERIC"; mapping?: Record<string, string> }) {
    const job = await this.imports.commit({ uploadedById: req.user.id, source: body.source, body: body.body, kind: body.kind, mapping: body.mapping ?? null });
    await this.audit.log(req.user.id, "IMPORT", "imports.commit", job.id, { fileName: job.fileName, status: job.status });
    return job;
  }

  @Get("history")
  history(@Query("take") take?: string) {
    return this.imports.history({ take: take ? Number.parseInt(take, 10) : undefined });
  }

  @Get(":id")
  job(@Param("id") id: string) {
    return this.imports.job(id);
  }
}
