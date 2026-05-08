import type { UserRole } from "./roles";

/** Stable keys for navigation and API authorization; configurable per access role in admin. */
export const APP_VIEW_KEYS = [
  "agent_sales",
  "agent_calendar",
  "agent_view",
  "agent_shiftplan",
  "controlling_review",
  "controlling_antraege",
  "controlling_roster_day",
  "controlling_roster_month",
  "controlling_operations",
  "controlling_level1",
  "controlling_level2",
  "controlling_endkontrolle",
  "controlling_imports",
  "controlling_reports",
  "dashboard_kpi",
  "leadership_dashboard",
  "admin_users",
  "admin_catalog",
  "admin_calendar_rules",
  "admin_config",
  "admin_org_access",
  "admin_audit",
] as const;

export type AppViewKey = (typeof APP_VIEW_KEYS)[number];

const ALL_VIEWS = [...APP_VIEW_KEYS] as AppViewKey[];

const AGENT_VIEWS: AppViewKey[] = ["agent_sales", "agent_calendar", "agent_view", "agent_shiftplan"];

const CONTROLLING_VIEWS: AppViewKey[] = [
  "controlling_review",
  "controlling_antraege",
  "controlling_roster_day",
  "controlling_roster_month",
  "controlling_operations",
  "controlling_level1",
  "controlling_level2",
  "controlling_endkontrolle",
  "controlling_imports",
  "controlling_reports",
  "dashboard_kpi",
];

/** Baseline menu/API visibility from the system role before access-role grants are merged. */
export function defaultVisibleViewsForRole(role: UserRole): AppViewKey[] {
  if (role === "ADMIN") {
    return ALL_VIEWS;
  }
  if (role === "CONTROLLING") {
    return CONTROLLING_VIEWS;
  }
  return AGENT_VIEWS;
}

export function isAppViewKey(value: string): value is AppViewKey {
  return (APP_VIEW_KEYS as readonly string[]).includes(value);
}
