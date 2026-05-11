import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { PasswordService } from "../auth/password.service";

interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
  hourlyRateEuro?: number;
  fte?: number;
  teamId?: string | null;
  active?: boolean;
  locale?: string;
}

interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: UserRole;
  password?: string;
  hourlyRateEuro?: number;
  fte?: number;
  teamId?: string | null;
  active?: boolean;
  locale?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  list(opts: { search?: string; role?: UserRole; teamId?: string; activeOnly?: boolean; take?: number; skip?: number } = {}) {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (opts.role) where.role = opts.role;
    if (opts.teamId) where.teamId = opts.teamId;
    if (opts.activeOnly) where.active = true;
    if (opts.search) {
      where.OR = [
        { email: { contains: opts.search, mode: "insensitive" } },
        { fullName: { contains: opts.search, mode: "insensitive" } },
      ];
    }
    return this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        take: opts.take ?? 50,
        skip: opts.skip ?? 0,
        orderBy: [{ active: "desc" }, { fullName: "asc" }],
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          active: true,
          locale: true,
          teamId: true,
          team: { select: { id: true, name: true, projectId: true } },
          hourlyRateEuro: true,
          fte: true,
          createdAt: true,
          lastLoginAt: true,
          accessRoleAssignments: { select: { accessRoleId: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        team: { include: { project: true } },
        accessRoleAssignments: { include: { accessRole: { include: { views: true, scopes: true } } } },
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    return user;
  }

  async create(input: CreateUserInput) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (exists) throw new BadRequestException("Email already in use");
    const passwordHash = await this.passwords.hash(input.password);
    return this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        role: input.role,
        passwordHash,
        hourlyRateEuro: input.hourlyRateEuro ?? 0,
        fte: input.fte ?? 1,
        teamId: input.teamId ?? null,
        active: input.active ?? true,
        locale: input.locale ?? "de",
      },
      select: { id: true, email: true, fullName: true, role: true, active: true, teamId: true, locale: true },
    });
  }

  async update(id: string, input: UpdateUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("User not found");
    const data: Prisma.UserUpdateInput = {};
    if (input.email) data.email = input.email.toLowerCase();
    if (input.fullName) data.fullName = input.fullName;
    if (input.role) data.role = input.role;
    if (input.hourlyRateEuro !== undefined) data.hourlyRateEuro = input.hourlyRateEuro;
    if (input.fte !== undefined) data.fte = input.fte;
    if (input.teamId !== undefined) data.team = input.teamId ? { connect: { id: input.teamId } } : { disconnect: true };
    if (input.active !== undefined) data.active = input.active;
    if (input.locale) data.locale = input.locale;
    if (input.password) data.passwordHash = await this.passwords.hash(input.password);
    return this.prisma.user.update({ where: { id }, data });
  }

  async disable(id: string) {
    return this.prisma.user.update({ where: { id }, data: { active: false } });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
  }
}
