import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { OrgScopeResourceType } from "@prisma/client";
import { accessRoleCreateSchema, accessRoleScopesSchema, accessRoleViewsSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminOrgAccessService } from "./admin-org-access.service";

@Controller("admin/org-access")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminOrgAccessController {
  constructor(
    private readonly service: AdminOrgAccessService,
    private readonly audit: AuditService,
  ) {}

  @Get("snapshot")
  snapshot() {
    return this.service.snapshot();
  }

  // ----- Dienstleister -----
  @Post("dienstleister")
  async createDl(@Req() req: { user: RequestUser }, @Body() body: { name: string }) {
    const saved = await this.service.createDienstleister(body.name);
    await this.audit.log(req.user.id, "CREATE", "org.dienstleister", saved.id, saved);
    return saved;
  }
  @Patch("dienstleister/:id")
  async patchDl(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body() body: { name: string }) {
    const saved = await this.service.updateDienstleister(id, body.name);
    await this.audit.log(req.user.id, "UPDATE", "org.dienstleister", id, saved);
    return saved;
  }
  @Delete("dienstleister/:id")
  async deleteDl(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const result = await this.service.deleteDienstleister(id);
    await this.audit.log(req.user.id, "DELETE", "org.dienstleister", id, null);
    return result;
  }

  // ----- Abteilungen -----
  @Post("abteilungen")
  async createAbteilung(@Req() req: { user: RequestUser }, @Body() body: { name: string; dienstleisterId: string }) {
    const saved = await this.service.createAbteilung(body.name, body.dienstleisterId);
    await this.audit.log(req.user.id, "CREATE", "org.abteilung", saved.id, saved);
    return saved;
  }
  @Patch("abteilungen/:id")
  async patchAbteilung(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body() body: { name: string; dienstleisterId?: string }) {
    const saved = await this.service.updateAbteilung(id, body.name, body.dienstleisterId);
    await this.audit.log(req.user.id, "UPDATE", "org.abteilung", id, saved);
    return saved;
  }
  @Delete("abteilungen/:id")
  async deleteAbteilung(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const result = await this.service.deleteAbteilung(id);
    await this.audit.log(req.user.id, "DELETE", "org.abteilung", id, null);
    return result;
  }

  // ----- Projects -----
  @Post("projects")
  async createProject(@Req() req: { user: RequestUser }, @Body() body: { name: string; abteilungId: string }) {
    const saved = await this.service.createProject(body.name, body.abteilungId);
    await this.audit.log(req.user.id, "CREATE", "org.project", saved.id, saved);
    return saved;
  }
  @Patch("projects/:id")
  async patchProject(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body() body: { name?: string; abteilungId?: string }) {
    const saved = await this.service.updateProject(id, body.name, body.abteilungId);
    await this.audit.log(req.user.id, "UPDATE", "org.project", id, saved);
    return saved;
  }
  @Delete("projects/:id")
  async deleteProject(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const result = await this.service.deleteProject(id);
    await this.audit.log(req.user.id, "DELETE", "org.project", id, null);
    return result;
  }

  // ----- Teams -----
  @Post("teams")
  async createTeam(@Req() req: { user: RequestUser }, @Body() body: { name: string; projectId: string }) {
    const saved = await this.service.createTeam(body.name, body.projectId);
    await this.audit.log(req.user.id, "CREATE", "org.team", saved.id, saved);
    return saved;
  }
  @Patch("teams/:id")
  async patchTeam(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body() body: { name?: string; projectId?: string }) {
    const saved = await this.service.updateTeam(id, body.name, body.projectId);
    await this.audit.log(req.user.id, "UPDATE", "org.team", id, saved);
    return saved;
  }
  @Delete("teams/:id")
  async deleteTeam(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const result = await this.service.deleteTeam(id);
    await this.audit.log(req.user.id, "DELETE", "org.team", id, null);
    return result;
  }

  // ----- Access roles -----
  @Post("access-roles")
  async createRole(@Req() req: { user: RequestUser }, @Body(Body$(accessRoleCreateSchema)) body: { name: string; slug: string; description?: string }) {
    const saved = await this.service.createAccessRole(body.name, body.slug, body.description);
    await this.audit.log(req.user.id, "CREATE", "access-role", saved.id, saved);
    return saved;
  }
  @Patch("access-roles/:id")
  async patchRole(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body() body: { name?: string; slug?: string; description?: string }) {
    const saved = await this.service.updateAccessRole(id, body.name, body.slug, body.description);
    await this.audit.log(req.user.id, "UPDATE", "access-role", id, saved);
    return saved;
  }
  @Delete("access-roles/:id")
  async deleteRole(@Req() req: { user: RequestUser }, @Param("id") id: string) {
    const result = await this.service.deleteAccessRole(id);
    await this.audit.log(req.user.id, "DELETE", "access-role", id, null);
    return result;
  }

  @Put("access-roles/:id/views")
  async putViews(@Req() req: { user: RequestUser }, @Param("id") id: string, @Body(Body$(accessRoleViewsSchema)) body: { viewKeys: string[] }) {
    const saved = await this.service.setAccessRoleViews(id, body.viewKeys ?? []);
    await this.audit.log(req.user.id, "UPDATE", "access-role.views", id, saved);
    return saved;
  }

  @Put("access-roles/:id/scopes")
  async putScopes(
    @Req() req: { user: RequestUser },
    @Param("id") id: string,
    @Body(Body$(accessRoleScopesSchema)) body: { scopes: Array<{ resourceType: OrgScopeResourceType; resourceId: string }> },
  ) {
    const saved = await this.service.setAccessRoleScopes(id, body.scopes ?? []);
    await this.audit.log(req.user.id, "UPDATE", "access-role.scopes", id, saved);
    return saved;
  }

  @Post("user-access-roles")
  async assign(@Req() req: { user: RequestUser }, @Body() body: { userId: string; accessRoleId: string }) {
    const saved = await this.service.assignUserAccessRole(body.userId, body.accessRoleId);
    await this.audit.log(req.user.id, "CREATE", "user.access-role", `${body.userId}/${body.accessRoleId}`, saved);
    return saved;
  }

  @Delete("user-access-roles")
  async unassign(@Req() req: { user: RequestUser }, @Body() body: { userId: string; accessRoleId: string }) {
    const result = await this.service.removeUserAccessRole(body.userId, body.accessRoleId);
    await this.audit.log(req.user.id, "DELETE", "user.access-role", `${body.userId}/${body.accessRoleId}`, body);
    return result;
  }
}
