import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AppViewKey, UserRole } from "@ess/shared";
import { ACCESS_KEY, type AccessRule } from "./access.decorator";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const access = this.reflector.getAllAndOverride<AccessRule>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole; visibleViews?: AppViewKey[] } | undefined;
    const role = user?.role;
    const visibleViews = user?.visibleViews ?? [];

    if (access?.anyRoles?.length || access?.anyViews?.length) {
      const roleOk = !!(access.anyRoles?.length && role && access.anyRoles.includes(role));
      const viewOk = !!(access.anyViews?.length && access.anyViews.some((v) => visibleViews.includes(v)));
      return roleOk || viewOk;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    return !!role && requiredRoles.includes(role);
  }
}
