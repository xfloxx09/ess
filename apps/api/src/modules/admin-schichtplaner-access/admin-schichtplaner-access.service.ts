import { Injectable, NotFoundException } from "@nestjs/common";
import type { OrgScopeResourceType } from "@prisma/client";
import type { SchichtplanerScopesSetDto } from "@ess/shared";
import { PrismaService } from "../../common/prisma.service";
import { AdminOrgAccessService } from "../admin-org-access/admin-org-access.service";

@Injectable()
export class AdminSchichtplanerAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: AdminOrgAccessService,
  ) {}

  scopeRoleSlug(userId: string) {
    return `schichtplaner-scope-${userId}`;
  }

  listSchichtplanerUsers() {
    return this.prisma.user.findMany({
      where: { role: "SCHICHTPLANUNG", deletedAt: null },
      select: { id: true, email: true, fullName: true, active: true },
      orderBy: { fullName: "asc" },
    });
  }

  async getScopeSelection(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: "SCHICHTPLANUNG", deletedAt: null },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) throw new NotFoundException("Schichtplaner not found");

    const slug = this.scopeRoleSlug(userId);
    const role = await this.prisma.accessRole.findUnique({
      where: { slug },
      include: { scopes: true },
    });
    const dienstleisterIds: string[] = [];
    const abteilungIds: string[] = [];
    const projectIds: string[] = [];
    const teamIds: string[] = [];
    if (role) {
      for (const s of role.scopes) {
        if (s.resourceType === "DIENSTLEISTER") dienstleisterIds.push(s.resourceId);
        else if (s.resourceType === "ABTEILUNG") abteilungIds.push(s.resourceId);
        else if (s.resourceType === "PROJECT") projectIds.push(s.resourceId);
        else if (s.resourceType === "TEAM") teamIds.push(s.resourceId);
      }
    }
    return { user, dienstleisterIds, abteilungIds, projectIds, teamIds, accessRoleId: role?.id ?? null };
  }

  async setScopes(userId: string, dto: SchichtplanerScopesSetDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: "SCHICHTPLANUNG", deletedAt: null },
    });
    if (!user) throw new NotFoundException("Schichtplaner not found");

    const scopes: Array<{ resourceType: OrgScopeResourceType; resourceId: string }> = [];
    for (const id of dto.dienstleisterIds ?? []) scopes.push({ resourceType: "DIENSTLEISTER", resourceId: id });
    for (const id of dto.abteilungIds ?? []) scopes.push({ resourceType: "ABTEILUNG", resourceId: id });
    for (const id of dto.projectIds ?? []) scopes.push({ resourceType: "PROJECT", resourceId: id });
    for (const id of dto.teamIds ?? []) scopes.push({ resourceType: "TEAM", resourceId: id });

    const slug = this.scopeRoleSlug(userId);
    let role = await this.prisma.accessRole.findUnique({ where: { slug } });
    if (!role) {
      role = await this.org.createAccessRole(`Schichtplanung · ${user.fullName}`, slug, "Sichtbarkeit (Admin „Schichtplaner-Zugang“)");
    } else {
      await this.org.updateAccessRole(role.id, `Schichtplanung · ${user.fullName}`);
    }

    await this.org.setAccessRoleViews(role.id, ["controlling_roster_day", "controlling_roster_month"]);
    await this.org.setAccessRoleScopes(role.id, scopes);
    await this.org.assignUserAccessRole(userId, role.id);

    return this.getScopeSelection(userId);
  }
}
