import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrgScopeResourceType } from "@prisma/client";
import { APP_VIEW_KEYS, isAppViewKey } from "@ess/shared";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class AdminOrgAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot() {
    const [dienstleister, abteilungen, projects, teams, accessRoles, users] = await Promise.all([
      this.prisma.dienstleister.findMany({ orderBy: { name: "asc" } }),
      this.prisma.abteilung.findMany({ orderBy: { name: "asc" } }),
      this.prisma.project.findMany({ orderBy: { name: "asc" } }),
      this.prisma.team.findMany({ orderBy: { name: "asc" } }),
      this.prisma.accessRole.findMany({
        orderBy: { name: "asc" },
        include: { views: true, scopes: true },
      }),
      this.prisma.user.findMany({
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          teamId: true,
          accessRoleAssignments: { select: { accessRoleId: true } },
        },
      }),
    ]);

    return {
      viewCatalog: [...APP_VIEW_KEYS],
      dienstleister,
      abteilungen,
      projects,
      teams,
      accessRoles: accessRoles.map((role) => ({
        id: role.id,
        name: role.name,
        slug: role.slug,
        description: role.description,
        views: role.views.map((v) => v.viewKey),
        scopes: role.scopes,
      })),
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        teamId: u.teamId,
        accessRoleIds: u.accessRoleAssignments.map((a) => a.accessRoleId),
      })),
    };
  }

  // ---------- Dienstleister ----------
  createDienstleister(name: string) {
    return this.prisma.dienstleister.create({ data: { name: name.trim() } });
  }
  async updateDienstleister(id: string, name: string) {
    try {
      return await this.prisma.dienstleister.update({ where: { id }, data: { name: name.trim() } });
    } catch {
      throw new NotFoundException("Dienstleister not found");
    }
  }
  async deleteDienstleister(id: string) {
    const has = await this.prisma.abteilung.count({ where: { dienstleisterId: id } });
    if (has > 0) throw new BadRequestException("Remove Abteilungen under this Dienstleister first.");
    await this.prisma.dienstleister.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Dienstleister not found");
    });
    return { ok: true };
  }

  // ---------- Abteilung ----------
  async createAbteilung(name: string, dienstleisterId: string) {
    await this.assertDienstleister(dienstleisterId);
    return this.prisma.abteilung.create({ data: { name: name.trim(), dienstleisterId } });
  }
  async updateAbteilung(id: string, name: string, dienstleisterId?: string) {
    if (dienstleisterId) await this.assertDienstleister(dienstleisterId);
    try {
      return await this.prisma.abteilung.update({
        where: { id },
        data: { name: name.trim(), ...(dienstleisterId ? { dienstleisterId } : {}) },
      });
    } catch {
      throw new NotFoundException("Abteilung not found");
    }
  }
  async deleteAbteilung(id: string) {
    const has = await this.prisma.project.count({ where: { abteilungId: id } });
    if (has > 0) throw new BadRequestException("Move or delete projects under this Abteilung first.");
    await this.prisma.abteilung.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Abteilung not found");
    });
    return { ok: true };
  }

  // ---------- Project ----------
  async createProject(name: string, abteilungId: string) {
    await this.assertAbteilung(abteilungId);
    return this.prisma.project.create({ data: { name: name.trim(), abteilungId } });
  }
  async updateProject(id: string, name?: string, abteilungId?: string) {
    if (abteilungId) await this.assertAbteilung(abteilungId);
    try {
      return await this.prisma.project.update({
        where: { id },
        data: { ...(name !== undefined ? { name: name.trim() } : {}), ...(abteilungId ? { abteilungId } : {}) },
      });
    } catch {
      throw new NotFoundException("Project not found");
    }
  }
  async deleteProject(id: string) {
    const teams = await this.prisma.team.count({ where: { projectId: id } });
    if (teams > 0) throw new BadRequestException("Remove Teams under this Project first.");
    await this.prisma.project.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Project not found");
    });
    return { ok: true };
  }

  // ---------- Team ----------
  async createTeam(name: string, projectId: string) {
    await this.assertProject(projectId);
    return this.prisma.team.create({ data: { name: name.trim(), projectId } });
  }
  async updateTeam(id: string, name?: string, projectId?: string) {
    if (projectId) await this.assertProject(projectId);
    try {
      return await this.prisma.team.update({
        where: { id },
        data: { ...(name !== undefined ? { name: name.trim() } : {}), ...(projectId ? { projectId } : {}) },
      });
    } catch {
      throw new NotFoundException("Team not found");
    }
  }
  async deleteTeam(id: string) {
    const has = await this.prisma.user.count({ where: { teamId: id } });
    if (has > 0) throw new BadRequestException("Reassign agents off this team before deleting.");
    await this.prisma.team.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Team not found");
    });
    return { ok: true };
  }

  // ---------- Access roles ----------
  async createAccessRole(name: string, slug: string, description?: string) {
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
    const exists = await this.prisma.accessRole.findUnique({ where: { slug: normalized } });
    if (exists) throw new ConflictException("Slug already in use");
    return this.prisma.accessRole.create({ data: { name: name.trim(), slug: normalized, description } });
  }
  async updateAccessRole(id: string, name?: string, slug?: string, description?: string) {
    const data: { name?: string; slug?: string; description?: string } = {};
    if (name !== undefined) data.name = name.trim();
    if (slug !== undefined) {
      const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
      const conflict = await this.prisma.accessRole.findFirst({ where: { slug: normalized, NOT: { id } } });
      if (conflict) throw new ConflictException("Slug already in use");
      data.slug = normalized;
    }
    if (description !== undefined) data.description = description;
    try {
      return await this.prisma.accessRole.update({ where: { id }, data });
    } catch {
      throw new NotFoundException("Access role not found");
    }
  }
  async deleteAccessRole(id: string) {
    await this.prisma.accessRole.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Access role not found");
    });
    return { ok: true };
  }

  async setAccessRoleViews(accessRoleId: string, viewKeys: string[]) {
    await this.assertAccessRole(accessRoleId);
    for (const key of viewKeys) {
      if (!isAppViewKey(key)) throw new BadRequestException(`Unknown view key: ${key}`);
    }
    await this.prisma.$transaction([
      this.prisma.accessRoleView.deleteMany({ where: { accessRoleId } }),
      this.prisma.accessRoleView.createMany({ data: viewKeys.map((viewKey) => ({ accessRoleId, viewKey })) }),
    ]);
    return { accessRoleId, viewKeys };
  }

  async setAccessRoleScopes(accessRoleId: string, scopes: Array<{ resourceType: OrgScopeResourceType; resourceId: string }>) {
    await this.assertAccessRole(accessRoleId);
    for (const s of scopes) await this.assertScopeTarget(s.resourceType, s.resourceId);
    await this.prisma.$transaction([
      this.prisma.accessRoleScope.deleteMany({ where: { accessRoleId } }),
      this.prisma.accessRoleScope.createMany({
        data: scopes.map((s) => ({ accessRoleId, resourceType: s.resourceType, resourceId: s.resourceId })),
      }),
    ]);
    return { accessRoleId, scopes };
  }

  async assignUserAccessRole(userId: string, accessRoleId: string) {
    await this.assertUser(userId);
    await this.assertAccessRole(accessRoleId);
    await this.prisma.userAccessRole.upsert({
      where: { userId_accessRoleId: { userId, accessRoleId } },
      create: { userId, accessRoleId },
      update: {},
    });
    return { userId, accessRoleId };
  }

  async removeUserAccessRole(userId: string, accessRoleId: string) {
    const result = await this.prisma.userAccessRole
      .delete({ where: { userId_accessRoleId: { userId, accessRoleId } } })
      .catch(() => null);
    if (!result) throw new NotFoundException("Assignment not found");
    return { ok: true };
  }

  // ---------- guards ----------
  private async assertDienstleister(id: string) {
    const has = await this.prisma.dienstleister.count({ where: { id } });
    if (!has) throw new NotFoundException("Dienstleister not found");
  }
  private async assertAbteilung(id: string) {
    const has = await this.prisma.abteilung.count({ where: { id } });
    if (!has) throw new NotFoundException("Abteilung not found");
  }
  private async assertProject(id: string) {
    const has = await this.prisma.project.count({ where: { id } });
    if (!has) throw new NotFoundException("Project not found");
  }
  private async assertAccessRole(id: string) {
    const has = await this.prisma.accessRole.count({ where: { id } });
    if (!has) throw new NotFoundException("Access role not found");
  }
  private async assertUser(id: string) {
    const has = await this.prisma.user.count({ where: { id } });
    if (!has) throw new NotFoundException("User not found");
  }
  private async assertScopeTarget(type: OrgScopeResourceType, id: string) {
    if (type === "DIENSTLEISTER") return this.assertDienstleister(id);
    if (type === "ABTEILUNG") return this.assertAbteilung(id);
    if (type === "PROJECT") return this.assertProject(id);
    if (type === "TEAM") {
      const has = await this.prisma.team.count({ where: { id } });
      if (!has) throw new NotFoundException("Team not found");
    }
  }
}
