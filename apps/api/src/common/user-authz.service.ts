import { Injectable } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import { defaultVisibleViewsForRole } from "@ess/shared";
import { PrismaService } from "./prisma.service";
import type { RequestUser } from "./authz.types";

type UserPick = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  teamId: string | null;
  locale: string;
};

@Injectable()
export class UserAuthzService {
  constructor(private readonly prisma: PrismaService) {}

  async buildRequestUser(user: UserPick): Promise<RequestUser> {
    const assignments = await this.prisma.userAccessRole.findMany({
      where: { userId: user.id },
      include: {
        accessRole: {
          include: { views: true, scopes: true },
        },
      },
    });

    const baseViews = defaultVisibleViewsForRole(user.role);
    const extra = new Set<AppViewKey>();
    for (const assignment of assignments) {
      for (const v of assignment.accessRole.views) {
        extra.add(v.viewKey as AppViewKey);
      }
    }
    const visibleViews = [...new Set([...baseViews, ...extra])];

    let allowedProjectIds: string[] | null = null;
    if (user.role !== "ADMIN") {
      if (assignments.length === 0) {
        allowedProjectIds = null;
      } else {
        let anyUnscoped = false;
        const explicit = new Set<string>();
        const teamIds = new Set<string>();
        const abteilungIds = new Set<string>();
        const dlIds = new Set<string>();
        for (const assignment of assignments) {
          const scopes = assignment.accessRole.scopes;
          if (scopes.length === 0) {
            anyUnscoped = true;
            continue;
          }
          for (const s of scopes) {
            if (s.resourceType === "PROJECT") explicit.add(s.resourceId);
            else if (s.resourceType === "TEAM") teamIds.add(s.resourceId);
            else if (s.resourceType === "ABTEILUNG") abteilungIds.add(s.resourceId);
            else if (s.resourceType === "DIENSTLEISTER") dlIds.add(s.resourceId);
          }
        }
        if (anyUnscoped) {
          allowedProjectIds = null;
        } else {
          if (teamIds.size > 0) {
            const teams = await this.prisma.team.findMany({
              where: { id: { in: [...teamIds] } },
              select: { projectId: true },
            });
            for (const t of teams) explicit.add(t.projectId);
          }
          if (abteilungIds.size > 0) {
            const projects = await this.prisma.project.findMany({
              where: { abteilungId: { in: [...abteilungIds] } },
              select: { id: true },
            });
            for (const p of projects) explicit.add(p.id);
          }
          if (dlIds.size > 0) {
            const projects = await this.prisma.project.findMany({
              where: { abteilung: { dienstleisterId: { in: [...dlIds] } } },
              select: { id: true },
            });
            for (const p of projects) explicit.add(p.id);
          }
          allowedProjectIds = [...explicit];
        }
      }
    }

    const accessRoles = assignments.map((a) => ({
      id: a.accessRole.id,
      name: a.accessRole.name,
      slug: a.accessRole.slug,
    }));

    let agentContext: RequestUser["agentContext"];
    if (user.role === "AGENT" && user.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: user.teamId },
        select: { id: true, name: true, project: { select: { id: true, name: true } } },
      });
      if (team) {
        agentContext = {
          teamId: team.id,
          teamName: team.name,
          projectId: team.project?.id ?? null,
          projectName: team.project?.name ?? null,
        };
      }
    }

    if (user.role === "SCHICHTPLANUNG") {
      if (assignments.length === 0) {
        allowedProjectIds = [];
      } else if (allowedProjectIds === null) {
        // Unscoped access roles would otherwise mean "all projects"; Schichtplanung must stay explicitly scoped.
        allowedProjectIds = [];
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      teamId: user.teamId,
      locale: user.locale,
      visibleViews,
      allowedProjectIds,
      accessRoles,
      agentContext,
    };
  }
}
