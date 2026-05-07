import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import { salesEntrySchema } from "@ess/shared";
import type { SalesEntryDto } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SalesService } from "./sales.service";

const REVIEW_ACCESS: { anyRoles: UserRole[]; anyViews: AppViewKey[] } = {
  anyRoles: ["ADMIN", "CONTROLLING"],
  anyViews: ["controlling_review"],
};

@Controller("sales")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles("AGENT")
  async create(@Req() req: { user: RequestUser }, @Body(Body$(salesEntrySchema)) dto: SalesEntryDto) {
    const entry = await this.sales.create(req.user.id, dto);
    await this.audit.log(req.user.id, "CREATE", "sales.entry", entry.id, entry);
    return entry;
  }

  @Get("mine")
  @Roles("AGENT")
  mine(@Req() req: { user: RequestUser }) {
    return this.sales.listForAgent(req.user.id);
  }

  @Delete("mine")
  @Roles("AGENT")
  async deleteMine(@Req() req: { user: RequestUser }, @Query("id") id: string) {
    const result = await this.sales.remove(req.user.id, id);
    await this.audit.log(req.user.id, "DELETE", "sales.entry", id, result);
    return result;
  }

  @Get("month")
  @Access(REVIEW_ACCESS)
  month(@Query("month") month: string, @Query("agentId") agentId?: string, @Query("search") search?: string) {
    return this.sales.listByMonth(month, agentId, search);
  }

  @Delete("admin")
  @Roles("ADMIN")
  async deleteAdmin(@Req() req: { user: RequestUser }, @Query("id") id?: string) {
    if (!id) return { removed: 0 };
    const result = await this.sales.removeAsAdmin(id);
    await this.audit.log(req.user.id, "DELETE", "sales.entry.admin", id, result);
    return result;
  }

  @Get("catalog")
  @Roles("AGENT", "ADMIN", "CONTROLLING")
  catalog() {
    return this.sales.listProductsAndPremiums();
  }
}
