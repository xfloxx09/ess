"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { toMessage, useAuth, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey, formatDate, formatEuro } from "@/lib/utils";

type AgentKpiTabResponse = {
  month: string;
  sales: {
    entryCount: number;
    totalPremiumEuro: number;
    totalQuantity: number;
    byProject: Array<{ projectId: string; projectName: string; entryCount: number; premiumEuro: number }>;
    recentEntries: Array<{
      id: string;
      callDate: string;
      projectName: string;
      productLabel: string;
      quantity: number;
      premiumEuro: number;
    }>;
  };
  quality: {
    importDayCount: number;
    totals: { minuteIb: number; minuteOb: number; waitMinutes: number; salesEuro: number; npsEuro: number };
    byDay: Array<{
      date: string;
      minuteIb: number;
      minuteOb: number;
      waitMinutes: number;
      salesEuro: number;
      npsEuro: number;
      source: string | null;
    }>;
  };
};

function minutesToHoursLabel(m: number) {
  if (m === 0) return "0 h";
  return `${(m / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
}

export default function AgentKpiPage() {
  const auth = useRequireAuth(["AGENT"]);
  const { user } = useAuth();
  const t = useT();
  const [month, setMonth] = useState(currentMonthKey());

  const data = useQuery({
    queryKey: ["kpi", "agent-kpis", month],
    queryFn: () => api<AgentKpiTabResponse>(`/kpi/agent-kpis?month=${encodeURIComponent(month)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  const payload = data.data;
  const err = data.error ? toMessage(data.error) : null;

  return (
    <>
      <PageHeader title={t("agentWorkspace.kpiTitle")} description={t("agentWorkspace.kpiSubtitle")} />

      <Card className="mb-4">
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
          <div className="flex flex-col gap-2">
            <Label>{t("roster.day")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
              <Button type="button" variant="outline" size="sm" onClick={() => void data.refetch()} disabled={data.isFetching}>
                <RefreshCw className={data.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                {t("agentWorkspace.show")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {err && <p className="mb-4 text-sm text-destructive">{err}</p>}

      {payload && (
        <div className="space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("agentWorkspace.kpiSalesSection")}</h2>
              <p className="text-sm text-muted-foreground">{t("agentWorkspace.kpiSalesSectionHint")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiSalesEntries")}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">{payload.sales.entryCount}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiSalesQuantity")}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">{payload.sales.totalQuantity}</CardContent>
              </Card>
              <Card className="sm:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiSalesPremiumTotal")}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">{formatEuro(payload.sales.totalPremiumEuro)}</CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("agentWorkspace.kpiSalesByProject")}</CardTitle>
              </CardHeader>
              <CardContent>
                {payload.sales.byProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("agentWorkspace.kpiSalesEmpty")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("sales.table.project")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiSalesEntries")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiSalesPremiumTotal")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.sales.byProject.map((row) => (
                        <TableRow key={row.projectId}>
                          <TableCell className="font-medium">{row.projectName}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.entryCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatEuro(row.premiumEuro)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("agentWorkspace.kpiSalesRecent")}</CardTitle>
                <CardDescription>{t("agentWorkspace.kpiSalesRecentHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                {payload.sales.recentEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("agentWorkspace.kpiSalesEmpty")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("sales.table.date")}</TableHead>
                        <TableHead>{t("sales.table.project")}</TableHead>
                        <TableHead>{t("sales.table.product")}</TableHead>
                        <TableHead className="text-right">{t("sales.table.quantity")}</TableHead>
                        <TableHead className="text-right">{t("sales.table.premium")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.sales.recentEntries.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="tabular-nums">{formatDate(row.callDate)}</TableCell>
                          <TableCell>{row.projectName}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-muted-foreground">{row.productLabel}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatEuro(row.premiumEuro)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4 border-t pt-8">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("agentWorkspace.kpiQualitySection")}</h2>
              <p className="text-sm text-muted-foreground">{t("agentWorkspace.kpiQualitySectionHint")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiQualityDays")}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">{payload.quality.importDayCount}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiQualityIb")}</CardTitle>
                </CardHeader>
                <CardContent className="text-xl font-semibold tabular-nums">{minutesToHoursLabel(payload.quality.totals.minuteIb)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiQualityOb")}</CardTitle>
                </CardHeader>
                <CardContent className="text-xl font-semibold tabular-nums">{minutesToHoursLabel(payload.quality.totals.minuteOb)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiQualityWait")}</CardTitle>
                </CardHeader>
                <CardContent className="text-xl font-semibold tabular-nums">{minutesToHoursLabel(payload.quality.totals.waitMinutes)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.kpiQualityNps")}</CardTitle>
                </CardHeader>
                <CardContent className="text-xl font-semibold tabular-nums">{formatEuro(payload.quality.totals.npsEuro)}</CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t("agentWorkspace.kpiQualityCsvEuro")}</CardTitle>
                <CardDescription>{t("agentWorkspace.kpiQualityCsvEuroHint")}</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{formatEuro(payload.quality.totals.salesEuro)}</CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("agentWorkspace.kpiQualityByDay")}</CardTitle>
                <CardDescription>{t("agentWorkspace.kpiQualityByDayHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                {payload.quality.byDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("agentWorkspace.kpiQualityEmpty")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("sales.table.date")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiQualityIb")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiQualityOb")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiQualityWait")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiQualityCsvEuro")}</TableHead>
                        <TableHead className="text-right">{t("agentWorkspace.kpiQualityNps")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.quality.byDay.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell className="font-mono text-sm">{row.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.minuteIb}′</TableCell>
                          <TableCell className="text-right tabular-nums">{row.minuteOb}′</TableCell>
                          <TableCell className="text-right tabular-nums">{row.waitMinutes}′</TableCell>
                          <TableCell className="text-right tabular-nums">{formatEuro(row.salesEuro)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatEuro(row.npsEuro)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
