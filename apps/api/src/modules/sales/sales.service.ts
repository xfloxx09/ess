import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { SalesEntryDto } from "@ess/shared";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  create(agentId: string, dto: SalesEntryDto) {
    return this.prisma.salesEntry.create({
      data: {
        agentId,
        projectId: dto.projectId,
        productId: dto.productId,
        quantity: dto.quantity,
        callDate: dto.callDate,
        contractRef: dto.contractRef,
        orderRef: dto.orderRef,
        note: dto.note,
      },
    });
  }

  listForAgent(agentId: string) {
    return this.prisma.salesEntry.findMany({ where: { agentId }, orderBy: { callDate: "desc" }, take: 200 });
  }

  listByMonth(month: string, agentId?: string, search?: string) {
    const where: Prisma.SalesEntryWhereInput = {
      callDate: { startsWith: month },
    };
    if (agentId) where.agentId = agentId;
    if (search) {
      const q = search.trim();
      where.OR = [
        { contractRef: { contains: q, mode: "insensitive" } },
        { orderRef: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
        { agent: { fullName: { contains: q, mode: "insensitive" } } },
        { agent: { email: { contains: q, mode: "insensitive" } } },
      ];
    }
    return this.prisma.salesEntry.findMany({
      where,
      orderBy: [{ callDate: "desc" }, { createdAt: "desc" }],
      take: 1000,
      include: {
        agent: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, category: true } },
      },
    });
  }

  async remove(agentId: string, id: string) {
    const result = await this.prisma.salesEntry.deleteMany({ where: { id, agentId } });
    return { removed: result.count };
  }

  async removeAsAdmin(id: string) {
    const result = await this.prisma.salesEntry.deleteMany({ where: { id } });
    return { removed: result.count };
  }

  async listProductsAndPremiums() {
    const [projects, products, premiums] = await Promise.all([
      this.prisma.project.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { active: true, deletedAt: null }, orderBy: { name: "asc" } }),
      this.prisma.productPremium.findMany(),
    ]);
    return { projects, products, premiums };
  }
}
