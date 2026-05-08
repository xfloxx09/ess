import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class AgentWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active = not expired (or no expiry). Newest / pinned first. */
  listAnnouncements() {
    const now = new Date();
    return this.prisma.agentAnnouncement.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        pinned: true,
        publishedAt: true,
        expiresAt: true,
      },
    });
  }
}
