"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { toMessage, useAuth, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { currentMonthKey, formatDate, formatEuro } from "@/lib/utils";

type AgentMonthResponse = {
  days: Array<{
    id: string;
    date: string;
    minuteIb: number;
    minuteOb: number;
    waitMinutes: number;
    salesEuro: number;
    npsEuro: number;
    approvedA: number;
    approvedP: number;
    antragPaidSlots: number;
    antragPaidMinutes: number;
    antragPaidTypes: string[];
    antragPendingSlots: number;
    antragPendingCount: number;
    agreedSlots: number;
    disagreedSlots: number;
    bookingLabel?: string;
    bookingCode?: string;
    baseEuro: number;
    dayEuro: number;
  }>;
  abrechnung: {
    baseEuro: number;
    salesEuro: number;
    npsEuro: number;
    totalEuro: number;
  };
  totals: {
    minuteIb: number;
    minuteOb: number;
    waitMinutes: number;
    antragPaidMinutes: number;
    antragPendingSlots: number;
    salesEuro: number;
    npsEuro: number;
  };
};

function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AgentViewPage() {
  const auth = useRequireAuth(["AGENT"]);
  const { user } = useAuth();
  const t = useT();
  const [month, setMonth] = useState(currentMonthKey());
  const [compact, setCompact] = useState(true);

  const monthData = useQuery({
    queryKey: ["kpi", "agent-month", month],
    queryFn: () => api<AgentMonthResponse>(`/kpi/agent-month?month=${encodeURIComponent(month)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const prevKey = useMemo(() => prevMonthKey(month), [month]);
  const prevSales = useQuery({
    queryKey: ["kpi", "agent-month", prevKey, "sales-only"],
    queryFn: () => api<AgentMonthResponse>(`/kpi/agent-month?month=${encodeURIComponent(prevKey)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const productiveHoursIb = (m: number) => m / 60;

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  const data = monthData.data;
  const err = monthData.error ? toMessage(monthData.error) : null;

  return (
    <>
      <PageHeader title={t("agentWorkspace.myMonthTitle")} description={t("agentWorkspace.myMonthSubtitle")} />

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
          <div>
            <p className="text-muted-foreground">{t("agentWorkspace.statusFest")}</p>
            <p className="font-medium">AGENT</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label>{t("roster.day")}</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="compact" checked={compact} onCheckedChange={setCompact} />
            <Label htmlFor="compact">{compact ? t("agentWorkspace.compact") : t("agentWorkspace.detailed")}</Label>
          </div>
          <Button type="button" variant="secondary" onClick={() => void monthData.refetch()} disabled={monthData.isFetching}>
            <RefreshCw className={monthData.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {t("agentWorkspace.show")}
          </Button>
        </CardContent>
      </Card>

      {err && <p className="mb-4 text-sm text-destructive">{err}</p>}

      {data && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">IB (min)</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{data.totals.minuteIb}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">OB (min)</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{data.totals.minuteOb}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.totalPayout")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{formatEuro(data.abrechnung.totalEuro)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t("agentWorkspace.productiveHours")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{productiveHoursIb(data.totals.minuteIb).toFixed(2)} h</CardContent>
            </Card>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Abrechnung</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between border-b py-2">
                  <span className="text-muted-foreground">Minutenabrechnung (Basis)</span>
                  <span className="font-medium tabular-nums">{formatEuro(data.abrechnung.baseEuro)}</span>
                </div>
                <div className="flex justify-between border-b py-2">
                  <span className="text-muted-foreground">Sales (Monat)</span>
                  <span className="font-medium tabular-nums">{formatEuro(data.abrechnung.salesEuro)}</span>
                </div>
                <div className="flex justify-between border-b py-2">
                  <span className="text-muted-foreground">NPS / Import</span>
                  <span className="font-medium tabular-nums">{formatEuro(data.abrechnung.npsEuro)}</span>
                </div>
                <div className="flex justify-between border-b py-2">
                  <span className="text-muted-foreground">Bonus Vormonat (Sales)</span>
                  <span className="font-medium tabular-nums">
                    {prevSales.data ? formatEuro(prevSales.data.abrechnung.salesEuro) : "—"}
                  </span>
                </div>
                <div className="flex justify-between py-2 text-base font-semibold">
                  <span>Gesamtabrechnung</span>
                  <span className="tabular-nums">{formatEuro(data.abrechnung.totalEuro)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Abrechnung erweitert</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wartezeit (min)</span>
                  <span className="tabular-nums">{data.totals.waitMinutes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Antrag bezahlt (min)</span>
                  <span className="tabular-nums">{data.totals.antragPaidMinutes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Antrag offen (Slots)</span>
                  <span className="tabular-nums">{data.totals.antragPendingSlots}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("agentWorkspace.dailyLedger")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Projekt / Buchung</TableHead>
                    {!compact && <TableHead className="text-right">A (15m)</TableHead>}
                    {!compact && <TableHead className="text-right">P (15m)</TableHead>}
                    <TableHead className="text-right">IB min</TableHead>
                    <TableHead className="text-right">OB min</TableHead>
                    <TableHead className="text-right">Warte</TableHead>
                    {!compact && <TableHead className="text-right">Antrag ±</TableHead>}
                    <TableHead className="text-right">{t("agentWorkspace.productiveHours")}</TableHead>
                    <TableHead className="text-right">{t("agentWorkspace.minutesEuro")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={2}>{t("agentWorkspace.summaryRow")}</TableCell>
                    {!compact && <TableCell />}
                    {!compact && <TableCell />}
                    <TableCell className="text-right tabular-nums">{data.totals.minuteIb}</TableCell>
                    <TableCell className="text-right tabular-nums">{data.totals.minuteOb}</TableCell>
                    <TableCell className="text-right tabular-nums">{data.totals.waitMinutes}</TableCell>
                    {!compact && <TableCell className="text-right tabular-nums">{data.totals.antragPaidMinutes}</TableCell>}
                    <TableCell className="text-right tabular-nums">{productiveHoursIb(data.totals.minuteIb).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuro(data.abrechnung.totalEuro)}</TableCell>
                  </TableRow>
                  {data.days.map((day) => (
                    <TableRow key={day.id}>
                      <TableCell>{formatDate(day.date)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">
                        {user?.agentContext?.projectName ?? "—"} · {day.bookingLabel ?? "—"} {day.bookingCode ? `(${day.bookingCode})` : ""}
                      </TableCell>
                      {!compact && <TableCell className="text-right tabular-nums">{day.approvedA}</TableCell>}
                      {!compact && <TableCell className="text-right tabular-nums">{day.approvedP}</TableCell>}
                      <TableCell className="text-right tabular-nums">{day.minuteIb}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.minuteOb}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.waitMinutes}</TableCell>
                      {!compact && (
                        <TableCell className="text-right text-xs tabular-nums">
                          {day.antragPaidMinutes > 0 ? `+${day.antragPaidMinutes}` : ""}
                          {day.antragPendingSlots > 0 ? ` / offen ${day.antragPendingSlots}` : ""}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{productiveHoursIb(day.minuteIb).toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEuro(day.dayEuro)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {!monthData.isLoading && !data && !err && (
        <p className="text-sm text-muted-foreground">{t("agentWorkspace.show")} …</p>
      )}
    </>
  );
}
