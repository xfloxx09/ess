export type UserRole = "AGENT" | "ADMIN" | "CONTROLLING" | "SCHICHTPLANUNG";

export const USER_ROLES: UserRole[] = ["AGENT", "CONTROLLING", "ADMIN", "SCHICHTPLANUNG"];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as string[]).includes(value);
}
