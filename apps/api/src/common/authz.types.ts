import type { AppViewKey, UserRole } from "@ess/shared";

export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  teamId: string | null;
  locale: string;
  visibleViews: AppViewKey[];
  /** When non-null, controlling/admin endpoints filter to these project ids. */
  allowedProjectIds: string[] | null;
  accessRoles: Array<{ id: string; name: string; slug: string }>;
  /** Populated for agents: home team and project for sales defaults and UI headers. */
  agentContext?: {
    teamId: string;
    teamName: string;
    projectId: string | null;
    projectName: string | null;
  };
}
