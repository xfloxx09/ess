"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BarChart3, Coins, ListChecks, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey, formatEuro } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface DashboardData {
  month: string;
  payoutEuro: number;
  agreedSlots: number;
  disagreedSlots: number;
  agreementPct: number;
  topAgents: Array<{ agentId: string; fullName: string; email: string; totalEuro: number }>;
  salesByProject: Array<{ projectId: string; projectName: string; salesEuro: number; count: number }>;
}

export default function DashboardPage() {
  const auth = useRequireAuth({ anyViews: ["dashboard_kpi", "controlling_review"] });
  const [month, setMonth] = useState(currentMonthKey());
  const t = useT();

  const dashboard = useQuery({
    queryKey: ["kpi", "dashboard", month],
    queryFn: () => api<DashboardData>(`/kpi/dashboard?month=${month}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={`${month}`}
        actions={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Coins className="h-5 w-5" />}
          label={t("dashboard.totalPayout")}
          value={dashboard.data ? formatEuro(dashboard.data.payoutEuro) : "—"}
          loading={dashboard.isLoading}
        />
        <KpiCard
          icon={<ListChecks className="h-5 w-5" />}
          label={t("dashboard.agreement")}
          value={dashboard.data ? `${dashboard.data.agreementPct.toFixed(1)}%` : "—"}
          loading={dashboard.isLoading}
        />
        <KpiCard
          icon={<ArrowUp className="h-5 w-5 text-success" />}
          label="Agreed slots"
          value={dashboard.data ? String(dashboard.data.agreedSlots) : "—"}
          loading={dashboard.isLoading}
        />
        <KpiCard
          icon={<ArrowDown className="h-5 w-5 text-destructive" />}
          label="Disagreed slots"
          value={dashboard.data ? String(dashboard.data.disagreedSlots) : "—"}
          loading={dashboard.isLoading}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> {t("dashboard.topAgents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.isLoading ? (
              <Skeleton className="h-72" />
            ) : (
              <div className="space-y-2">
                {dashboard.data?.topAgents.map((agent, idx) => (
                  <div key={agent.agentId} className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                    <div>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                      <span className="font-medium">{agent.fullName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{agent.email}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{formatEuro(agent.totalEuro)}</span>
                  </div>
                ))}
                {!dashboard.data?.topAgents.length && (
                  <p className="text-sm text-muted-foreground">{t("app.noData")}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> {t("dashboard.salesByProject")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.isLoading ? (
              <Skeleton className="h-72" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dashboard.data?.salesByProject ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="projectName" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(value: number) => formatEuro(value)} />
                  <Bar dataKey="salesEuro" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function KpiCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold tabular-nums">{value}</div>}
      </CardContent>
    </Card>
  );
}
