"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Coins, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey, formatEuro } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface LeadershipData {
  month: string;
  payoutEuro: number;
  agreedSlots: number;
  disagreedSlots: number;
  agreementPct: number;
  topAgents: Array<{ agentId: string; fullName: string; email: string; totalEuro: number }>;
  salesByProject: Array<{ projectId: string; projectName: string; salesEuro: number; count: number }>;
}

export default function LeadershipDashboardPage() {
  const auth = useRequireAuth({ anyViews: ["leadership_dashboard"] });
  const [month, setMonth] = useState(currentMonthKey());
  const t = useT();

  const q = useQuery({
    queryKey: ["kpi", "leadership", month],
    queryFn: () => api<LeadershipData>(`/kpi/leadership?month=${encodeURIComponent(month)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  return (
    <>
      <PageHeader
        title={t("leadership.title")}
        description={t("leadership.subtitle")}
        actions={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">{t("dashboard.totalPayout")}</CardTitle>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{q.data ? formatEuro(q.data.payoutEuro) : "—"}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">{t("dashboard.agreement")}</CardTitle>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{q.data ? `${q.data.agreementPct.toFixed(1)}%` : "—"}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">{t("leadership.scopeNote")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("leadership.scopeBody")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.topAgents")}</CardTitle>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <div className="space-y-2">
                {q.data?.topAgents.map((agent, idx) => (
                  <div key={agent.agentId} className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <div>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                      <span className="font-medium">{agent.fullName}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{formatEuro(agent.totalEuro)}</span>
                  </div>
                ))}
                {!q.data?.topAgents.length && <p className="text-sm text-muted-foreground">{t("app.noData")}</p>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.salesByProject")}</CardTitle>
          </CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <div className="space-y-2">
                {q.data?.salesByProject.map((row) => (
                  <div key={row.projectId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{row.projectName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatEuro(row.salesEuro)} · {row.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
