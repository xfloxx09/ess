import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../../common/env";
import { PrismaService } from "../../common/prisma.service";
import { UserAuthzService } from "../../common/user-authz.service";
import { PasswordService } from "./password.service";

const REFRESH_BYTES = 48;
const RESET_BYTES = 32;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly authz: UserAuthzService,
  ) {}

  async login(email: string, password: string, ctx?: { userAgent?: string; ipAddress?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || user.deletedAt) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (this.passwords.needsRehash(user.passwordHash)) {
      const newHash = await this.passwords.hash(password);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issueTokens(user.id, user.role, ctx);
    const me = await this.buildMe(user.id);
    return { ...tokens, user: me };
  }

  async refresh(rawRefreshToken: string, ctx?: { userAgent?: string; ipAddress?: string }) {
    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid session");
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.active || user.deletedAt) {
      throw new UnauthorizedException("Account disabled");
    }
    const tokens = await this.issueTokens(user.id, user.role, ctx);
    const me = await this.buildMe(user.id);
    return { ...tokens, user: me };
  }

  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) return { ok: true };
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async me(userId: string) {
    return this.buildMe(userId);
  }

  async forgot(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) {
      // Always return ok to avoid user enumeration
      return { ok: true };
    }
    const raw = randomBytes(RESET_BYTES).toString("hex");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    // In a real deployment we'd email this. We surface it in dev so admins can copy it.
    return { ok: true, devToken: env.NODE_ENV === "production" ? undefined : raw };
  }

  async reset(token: string, password: string) {
    const tokenHash = hashToken(token);
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired reset token");
    }
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
      this.prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  /** Admin generates a one-time reset link for a user. Returns the raw token. */
  async generateResetForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");
    const raw = randomBytes(RESET_BYTES).toString("hex");
    const tokenHash = hashToken(raw);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) },
    });
    return { token: raw, expiresIn: "24h" };
  }

  private async issueTokens(userId: string, role: string, ctx?: { userAgent?: string; ipAddress?: string }) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_TTL },
    );
    const refreshToken = randomBytes(REFRESH_BYTES).toString("hex");
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseTtlToMs(env.JWT_REFRESH_TTL));
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        userAgent: ctx?.userAgent ?? null,
        ipAddress: ctx?.ipAddress ?? null,
        expiresAt,
      },
    });
    return { accessToken, refreshToken, refreshExpiresAt: expiresAt.toISOString() };
  }

  private async buildMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true, teamId: true, locale: true },
    });
    if (!user) throw new UnauthorizedException("User not found");
    return this.authz.buildRequestUser(user);
  }
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(ttl.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const factor = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return value * factor;
}
