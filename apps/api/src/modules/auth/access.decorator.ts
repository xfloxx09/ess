import { SetMetadata } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";

export const ACCESS_KEY = "ess_access";

export type AccessRule = {
  anyRoles?: UserRole[];
  /** Pass if the user has at least one of these view keys (from system role defaults or access roles). */
  anyViews?: AppViewKey[];
};

export const Access = (rule: AccessRule) => SetMetadata(ACCESS_KEY, rule);
