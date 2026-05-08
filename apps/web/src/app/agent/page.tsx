"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  Megaphone,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey, formatDate, formatEuro } from "@/lib/utils";

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
};

type BookingRow = { id: string; date: string };

type AgentMonthResponse = {
  days: Array<{ disagreedSlots: number }>;
  abrechnung: { totalEuro: number };
};

type InboxItem = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

function previewText(text: string, max = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function AgentDashboardPage() {
  const auth = useRequireAuth(["AGENT"]);
  const { user } = useAuth();
  const t = useT();
  const month = currentMonthKey();

  const announcements = useQuery({
    queryKey: ["agent-workspace", "announcements"],
    queryFn: () => api<Announcement[]>("/agent-workspace/announcements", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const bookings = useQuery({
    queryKey: ["calendar", "mine", month, "dash"],
    queryFn: () => api<BookingRow[]>(`/calendar/mine?month=${encodeURIComponent(month)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const kpiMonth = useQuery({
    queryKey: ["kpi", "agent-month", month, "dash"],
    queryFn: () => api<AgentMonthResponse>(`/kpi/agent-month?month=${encodeURIComponent(month)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const unread = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api<{ count: number }>("/notifications/unread-count", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const recentInbox = useQuery({
    queryKey: ["notifications", "recent", "dash"],
    queryFn: () => api<InboxItem[]>("/notifications?take=5", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const disagreedSlots =
    kpiMonth.data?.days.reduce((sum, d) => sum + (d.disagreedSlots ?? 0), 0) ?? "—";
  const monthEuro = kpiMonth.data?.abrechnung?.totalEuro;

  const refetchAll = () => {
    void announcements.refetch();
    void bookings.refetch();
    void kpiMonth.refetch();
    void unread.refetch();
    void recentInbox.refetch();
  };

  const busy =
    announcements.isFetching ||
    bookings.isFetching ||
    kpiMonth.isFetching ||
    recentInbox.isFetching ||
    unread.isFetching;

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  const quickLinks: Array<{
    href: string;
    labelKey: string;
    descKey: string;
    icon: typeof ShoppingCart;
  }> = [
    { href: "/agent/sales", labelKey: "nav.agentSales", descKey: "agentWorkspace.dashCardSales", icon: ShoppingCart },
    { href: "/agent/calendar", labelKey: "nav.agentCalendar", descKey: "agentWorkspace.dashCardCalendar", icon: Calendar },
    { href: "/agent/view", labelKey: "nav.agentView", descKey: "agentWorkspace.dashCardMonth", icon: BarChart3 },
    { href: "/agent/shiftplan", labelKey: "nav.agentShiftplan", descKey: "agentWorkspace.dashCardShiftplan", icon: ClipboardList },
  ];

  return (
    <>
      <PageHeader title={t("agentWorkspace.dashTitle")} description={t("agentWorkspace.dashSubtitle")} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("agentWorkspace.dashMonthLabel")}: <span className="font-mono font-medium text-foreground">{month}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetchAll()} disabled={busy}>
          <RefreshCw className={busy ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          {t("agentWorkspace.refresh")}
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("agentWorkspace.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.name")}</p>
            <p className="font-medium">{user?.fullName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.defaultProject")}</p>
            <p className="font-medium">{user?.agentContext?.projectName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.team")}</p>
            <p className="font-medium">{user?.agentContext?.teamName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.statusFest")}</p>
            <p className="font-medium">AGENT</p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.dashStatBookings")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{bookings.data?.length ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.dashStatMonthEuro")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {monthEuro !== undefined ? formatEuro(monthEuro) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.dashStatDisagreed")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{disagreedSlots}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.dashStatUnread")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{unread.data?.count ?? "—"}</CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              <CardTitle>{t("agentWorkspace.dashAnnouncements")}</CardTitle>
            </div>
            <CardDescription>{t("agentWorkspace.dashAnnouncementsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {announcements.isError && (
              <p className="text-sm text-destructive">{t("agentWorkspace.dashLoadError")}</p>
            )}
            {!announcements.isError && (announcements.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">{t("agentWorkspace.dashNoAnnouncements")}</p>
            )}
            {(announcements.data?.length ?? 0) > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">{t("agentWorkspace.dashColTitle")}</TableHead>
                    <TableHead>{t("agentWorkspace.dashColMessage")}</TableHead>
                    <TableHead className="w-[22%] text-right">{t("agentWorkspace.dashColDate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.data!.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top font-medium">
                        <div className="flex flex-wrap items-center gap-1">
                          {row.pinned && (
                            <Badge variant="secondary" className="text-xs">
                              {t("agentWorkspace.dashPinned")}
                            </Badge>
                          )}
                          <span>{row.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md align-top text-sm text-muted-foreground">
                        <span className="line-clamp-3">{previewText(row.body)}</span>
                      </TableCell>
                      <TableCell className="align-top text-right text-xs text-muted-foreground tabular-nums">
                        {formatDate(row.publishedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("agentWorkspace.dashInbox")}</CardTitle>
            <CardDescription>{t("agentWorkspace.dashInboxHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {(recentInbox.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">{t("agentWorkspace.dashInboxEmpty")}</p>
            )}
            {(recentInbox.data?.length ?? 0) > 0 && (
              <ul className="space-y-3 text-sm">
                {recentInbox.data!.map((n) => (
                  <li key={n.id} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium leading-snug">{n.title}</span>
                      {!n.readAt && (
                        <Badge variant="outline" className="shrink-0 text-xs">
                          {t("agentWorkspace.dashUnread")}
                        </Badge>
                      )}
                    </div>
                    {n.body && <p className="mt-1 line-clamp-2 text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatDate(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("agentWorkspace.dashQuickLinks")}</CardTitle>
          <CardDescription>{t("agentWorkspace.dashQuickLinksHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary hover:bg-accent/50"
              >
                <Icon className="mb-2 h-5 w-5 text-muted-foreground group-hover:text-foreground" />
                <span className="font-semibold">{t(item.labelKey)}</span>
                <span className="mt-1 text-xs text-muted-foreground">{t(item.descKey)}</span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
