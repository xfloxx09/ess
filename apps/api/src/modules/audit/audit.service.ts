import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(actorUserId: string | null, action: string, resource: string, resourceId?: string | null, payload?: unknown, ipAddress?: string | null) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        resource,
        resourceId: resourceId ?? null,
        payload: (payload ?? null) as Prisma.InputJsonValue,
        ipAddress: ipAddress ?? null,
      },
    });
  }

  async list(opts: { actorUserId?: string; resource?: string; action?: string; from?: Date; to?: Date; take?: number; skip?: number }) {
    const take = opts.take ?? 100;
    const skip = opts.skip ?? 0;
    const where: Prisma.AuditLogWhereInput = {};
    if (opts.actorUserId) where.actorUserId = opts.actorUserId;
    if (opts.resource) where.resource = opts.resource;
    if (opts.action) where.action = opts.action;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) (where.createdAt as Prisma.DateTimeFilter).gte = opts.from;
      if (opts.to) (where.createdAt as Prisma.DateTimeFilter).lte = opts.to;
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, email: true, fullName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, take, skip };
  }
}
