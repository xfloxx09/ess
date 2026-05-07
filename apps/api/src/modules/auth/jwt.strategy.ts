import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { env } from "../../common/env";
import { PrismaService } from "../../common/prisma.service";
import { UserAuthzService } from "../../common/user-authz.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: UserAuthzService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, teamId: true, locale: true, active: true, deletedAt: true },
    });
    if (!user || !user.active || user.deletedAt) {
      throw new UnauthorizedException("User not found");
    }
    return this.authz.buildRequestUser(user);
  }
}
