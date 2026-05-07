import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { userCreateSchema, userUpdateSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Access } from "../auth/access.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UsersService } from "./users.service";

const ADMIN_USERS_ACCESS = { anyRoles: ["ADMIN" as UserRole], anyViews: ["admin_users" as const] };

@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Access(ADMIN_USERS_ACCESS)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query("search") search?: string,
    @Query("role") role?: UserRole,
    @Query("teamId") teamId?: string,
    @Query("active") active?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const [items, total] = await this.users.list({
      search,
      role,
      teamId,
      activeOnly: active === "true",
      take: take ? Number.parseInt(take, 10) : undefined,
      skip: skip ? Number.parseInt(skip, 10) : undefined,
    });
    return { items, total };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Post()
  async create(
    @Req() req: { user: RequestUser },
    @Body(Body$(userCreateSchema)) body: { email: string; fullName: string; role: UserRole; password: string; hourlyRateEuro?: number; teamId?: string | null; active?: boolean; locale?: string },
  ) {
    const saved = await this.users.create(body);
    await this.audit.log(req.user.id, "CREATE", "user", saved.id, { email: saved.email, role: saved.role });
    return saved;
  }

  @Patch(":id")
  async update(
    @Req() req: { user: RequestUser },
    @Param("id") id: string,
    @Body(Body$(userUpdateSchema)) body: Parameters<UsersService["update"]>[1],
  ) {
    const saved = await this.users.update(id, body);
    await this.audit.log(req.user.id, "UPDATE", "user", id, body);
    return saved;
  }

  @Delete(":id")
  async remove(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const saved = await this.users.softDelete(id);
    await this.audit.log(req.user.id, "DELETE", "user", id, null);
    return saved;
  }

  @Post(":id/reset-link")
  async generateReset(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const result = await this.auth.generateResetForUser(id);
    await this.audit.log(req.user.id, "GENERATE_RESET", "user", id, null);
    return result;
  }
}
