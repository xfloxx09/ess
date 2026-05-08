"use client";

import {
  Activity,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarRange,
  ChevronLeft,
  ClipboardList,
  Database,
  FileText,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Network,
  Scale,
  ScrollText,
  ShoppingCart,
  Sliders,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppViewKey, UserRole } from "@ess/shared";
import { useAuth } from "@/lib/auth";
import { useUiStore } from "@/lib/stores";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  labelKey: string;
  icon: typeof Calendar;
  roles?: UserRole[];
  viewKey?: AppViewKey;
}

interface NavSection {
  titleKey: string;
  items: NavLink[];
}

const sections: NavSection[] = [
  {
    titleKey: "Dashboard",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, viewKey: "dashboard_kpi" },
      { href: "/leadership", labelKey: "nav.leadershipDashboard", icon: Briefcase, viewKey: "leadership_dashboard" },
    ],
  },
  {
    titleKey: "Agent",
    items: [
      { href: "/agent", labelKey: "nav.agentDashboard", icon: LayoutDashboard, viewKey: "agent_dashboard" },
      { href: "/agent/sales", labelKey: "nav.agentSales", icon: ShoppingCart, viewKey: "agent_sales" },
      { href: "/agent/kpi", labelKey: "nav.agentKpi", icon: TrendingUp, viewKey: "agent_kpi" },
      { href: "/agent/calendar", labelKey: "nav.agentCalendar", icon: Calendar, viewKey: "agent_calendar" },
      { href: "/agent/view", labelKey: "nav.agentView", icon: BarChart3, viewKey: "agent_view" },
      { href: "/agent/shiftplan", labelKey: "nav.agentShiftplan", icon: ClipboardList, viewKey: "agent_shiftplan" },
    ],
  },
  {
    titleKey: "Controlling",
    items: [
      { href: "/controlling/review", labelKey: "nav.controllingReview", icon: ListChecks, viewKey: "controlling_review" },
      { href: "/controlling/antraege", labelKey: "nav.controllingAntraege", icon: HelpCircle, viewKey: "controlling_antraege" },
      { href: "/controlling/level1", labelKey: "nav.controllingLevel1", icon: Activity, viewKey: "controlling_level1" },
      { href: "/controlling/level2", labelKey: "nav.controllingLevel2", icon: UserCheck, viewKey: "controlling_level2" },
      { href: "/controlling/endkontrolle", labelKey: "nav.controllingEndkontrolle", icon: Scale, viewKey: "controlling_endkontrolle" },
      { href: "/controlling/roster-day", labelKey: "nav.controllingRosterDay", icon: CalendarRange, viewKey: "controlling_roster_day" },
      { href: "/controlling/roster-month", labelKey: "nav.controllingRosterMonth", icon: CalendarRange, viewKey: "controlling_roster_month" },
      { href: "/imports", labelKey: "nav.controllingImports", icon: Upload, viewKey: "controlling_imports" },
      { href: "/reports", labelKey: "nav.controllingReports", icon: FileText, viewKey: "controlling_reports" },
    ],
  },
  {
    titleKey: "Admin",
    items: [
      { href: "/admin/users", labelKey: "nav.adminUsers", icon: Users, viewKey: "admin_users" },
      { href: "/admin/org-access", labelKey: "nav.adminOrgAccess", icon: Network, viewKey: "admin_org_access" },
      { href: "/admin/catalog", labelKey: "nav.adminCatalog", icon: Database, viewKey: "admin_catalog" },
      { href: "/admin/calendar-rules", labelKey: "nav.adminCalendarRules", icon: KeyRound, viewKey: "admin_calendar_rules" },
      { href: "/admin/config", labelKey: "nav.adminConfig", icon: Sliders, viewKey: "admin_config" },
      { href: "/admin/audit", labelKey: "nav.adminAudit", icon: ScrollText, viewKey: "admin_audit" },
    ],
  },
];

export function Sidebar() {
  const { user, canAccessView, authorized } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const pathname = usePathname();
  const t = useT();

  if (!user) return null;

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-card transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            E
          </div>
          {!sidebarCollapsed && <span>ESS</span>}
        </Link>
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8">
          <ChevronLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 scrollbar-thin">
        {sections.map((section) => {
          const visibleItems = section.items.filter((item) => {
            if (item.roles && !authorized(item.roles)) return false;
            if (item.viewKey && !canAccessView(item.viewKey)) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.titleKey} className="mb-4">
              {!sidebarCollapsed && (
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.titleKey}
                </div>
              )}
              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const active =
                    item.href === "/agent"
                      ? pathname === "/agent" || pathname === "/agent/"
                      : pathname === item.href || pathname?.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          sidebarCollapsed && "justify-center px-0",
                        )}
                        title={sidebarCollapsed ? t(item.labelKey) : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!sidebarCollapsed && <span className="truncate">{t(item.labelKey)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
