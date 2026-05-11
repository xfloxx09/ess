export type { UserRole } from "./roles";
export { USER_ROLES, isUserRole } from "./roles";
export * from "./views";
export * from "./schemas";

import type { UserRole } from "./roles";
import type { AppViewKey } from "./views";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  teamId: string | null;
  locale: string;
  visibleViews: AppViewKey[];
  accessRoles: Array<{ id: string; name: string; slug: string }>;
  agentContext?: {
    teamId: string;
    teamName: string;
    projectId: string | null;
    projectName: string | null;
  };
}

export interface ProductPremium {
  id: string;
  projectId: string;
  productId: string;
  amountEuro: number;
}

export interface ShiftBlockJson {
  start: string;
  end: string;
}

export type RealtimeEvent =
  | { type: "roster.cellChanged"; projectId: string; teamId: string; agentId: string; date: string; slotIndex: number; controllerCode: string; rawCode: string; version: number }
  | { type: "roster.cellDeleted"; projectId: string; teamId: string; agentId: string; date: string; slotIndex: number }
  | { type: "antrag.created"; antragId: string; agentId: string; date: string }
  | { type: "antrag.decided"; antragId: string; agentId: string; date: string; status: "APPROVED" | "REJECTED" }
  | { type: "notification.created"; userId: string; notificationId: string }
  | { type: "import.progress"; jobId: string; rowsProcessed: number; rowsTotal: number }
  | { type: "import.completed"; jobId: string }
  | { type: "import.failed"; jobId: string; message: string };
