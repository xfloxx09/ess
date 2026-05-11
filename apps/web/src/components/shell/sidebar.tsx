"use client";

import {
  Activity,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
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
  Wrench,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppViewKey, UserRole } from "@ess/shared";
import { useAuth } from "@/lib/auth";
import { useUiStore } from "@/lib/stores";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavChild {
  href: string;
  labelKey: string;
  viewKey?: AppViewKey;
  viewKeysAny?: AppViewKey[];
}

interface NavLink {
  href: string;
  labelKey: string;
  icon: typeof Calendar;
  roles?: UserRole[];
  viewKey?: AppViewKey;
  /** Show link if user has any of these views (e.g. Schichtplan group). */
  viewKeysAny?: AppViewKey[];
  /** Submenu grouping for expand/collapse + active styling. */
  groupKey?: "kpi" | "roster";
  children?: NavChild[];
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
      {
        href: "/agent/kpi",
        labelKey: "nav.agentKpi",
        icon: TrendingUp,
        viewKey: "agent_kpi",
        groupKey: "kpi",
        children: [
          { href: "/agent/kpi?tab=sales", labelKey: "nav.agentKpiSales" },
          { href: "/agent/kpi?tab=quality", labelKey: "nav.agentKpiQuality" },
        ],
      },
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
      {
        href: "/controlling/roster-day",
        labelKey: "nav.controllingSchichtplan",
        icon: CalendarRange,
        viewKeysAny: ["controlling_roster_day", "controlling_roster_month"],
        groupKey: "roster",
        children: [
          { href: "/controlling/roster-day", labelKey: "nav.rosterNavDay", viewKey: "controlling_roster_day" },
          { href: "/controlling/roster-month", labelKey: "nav.rosterNavMonth", viewKey: "controlling_roster_month" },
          {
            href: "/controlling/roster-report",
            labelKey: "nav.rosterNavReport",
            viewKeysAny: ["controlling_roster_day", "controlling_roster_month"],
          },
        ],
      },
      { href: "/imports", labelKey: "nav.controllingImports", icon: Upload, viewKey: "controlling_imports" },
      { href: "/reports", labelKey: "nav.controllingReports", icon: FileText, viewKey: "controlling_reports" },
    ],
  },
  {
    titleKey: "Admin",
    items: [
      { href: "/admin/users", labelKey: "nav.adminUsers", icon: Users, viewKey: "admin_users" },
      { href: "/admin/org-access", labelKey: "nav.adminOrgAccess", icon: Network, viewKey: "admin_org_access" },
      { href: "/admin/schichtplaner-access", labelKey: "nav.adminSchichtplanerAccess", icon: UserCog, viewKey: "admin_schichtplaner_access" },
      { href: "/admin/catalog", labelKey: "nav.adminCatalog", icon: Database, viewKey: "admin_catalog" },
      { href: "/admin/calendar-rules", labelKey: "nav.adminCalendarRules", icon: KeyRound, viewKey: "admin_calendar_rules" },
      { href: "/admin/shiftplan-booking", labelKey: "nav.adminShiftplanBooking", icon: Wrench, viewKey: "admin_shiftplan_booking" },
      { href: "/admin/config", labelKey: "nav.adminConfig", icon: Sliders, viewKey: "admin_config" },
      { href: "/admin/audit", labelKey: "nav.adminAudit", icon: ScrollText, viewKey: "admin_audit" },
    ],
  },
];

export function Sidebar() {
  const { user, canAccessView, authorized } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const [kpiGroupOpen, setKpiGroupOpen] = useState(false);
  const [rosterGroupOpen, setRosterGroupOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/agent/kpi") {
      setKpiGroupOpen(true);
    } else {
      setKpiGroupOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname?.startsWith("/controlling/roster")) {
      setRosterGroupOpen(true);
    } else {
      setRosterGroupOpen(false);
    }
  }, [pathname]);

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
            if (item.viewKeysAny?.length) {
              if (!item.viewKeysAny.some((vk) => canAccessView(vk))) return false;
            } else if (item.viewKey && !canAccessView(item.viewKey)) return false;
            if (item.children?.length) {
              const anyChild = item.children.some((ch) => {
                if (ch.viewKeysAny?.length) return ch.viewKeysAny.some((vk) => canAccessView(vk));
                if (ch.viewKey) return canAccessView(ch.viewKey);
                return true;
              });
              if (!anyChild) return false;
            }
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
                  const visibleChildren =
                    item.children?.filter((ch) => {
                      if (ch.viewKeysAny?.length) return ch.viewKeysAny.some((vk) => canAccessView(vk));
                      if (ch.viewKey) return canAccessView(ch.viewKey);
                      return true;
                    }) ?? [];

                  if (visibleChildren.length > 0 && item.groupKey) {
                    const Icon = item.icon;
                    const isKpi = item.groupKey === "kpi";
                    const isRoster = item.groupKey === "roster";
                    const parentActive = isKpi ? pathname === "/agent/kpi" : pathname?.startsWith("/controlling/roster") ?? false;
                    const groupOpen = isKpi ? kpiGroupOpen : rosterGroupOpen;
                    const setGroupOpen = isKpi ? setKpiGroupOpen : setRosterGroupOpen;
                    const tab = searchParams.get("tab") === "quality" ? "quality" : "sales";
                    const collapsedHref = visibleChildren[0]!.href;

                    if (sidebarCollapsed) {
                      return (
                        <li key={`${item.groupKey}-${item.href}`}>
                          <Link
                            href={collapsedHref}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                              parentActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                              "justify-center px-0",
                            )}
                            title={t(item.labelKey)}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                          </Link>
                        </li>
                      );
                    }
                    return (
                      <li key={`${item.groupKey}-${item.href}`} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => setGroupOpen((o) => !o)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                            parentActive ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                          aria-expanded={groupOpen}
                        >
                          <ChevronRight
                            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", groupOpen && "rotate-90")}
                            aria-hidden
                          />
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </button>
                        {groupOpen && (
                          <ul className="ml-2 space-y-0.5 border-l border-border/80 pl-2">
                            {visibleChildren.map((sub) => {
                              let subActive = false;
                              if (isKpi) {
                                const isQuality = sub.href.includes("tab=quality");
                                subActive = pathname === "/agent/kpi" && (isQuality ? tab === "quality" : tab === "sales");
                              } else if (isRoster) {
                                subActive = pathname === sub.href;
                              }
                              return (
                                <li key={sub.href}>
                                  <Link
                                    href={sub.href}
                                    className={cn(
                                      "flex items-center rounded-md py-1.5 pl-2 pr-2 text-sm transition-colors",
                                      subActive
                                        ? "bg-primary font-medium text-primary-foreground"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                  >
                                    <span className="truncate">{t(sub.labelKey)}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

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
