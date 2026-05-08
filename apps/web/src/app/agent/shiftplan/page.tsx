"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { useT } from "@/i18n/provider";
import { cn, currentMonthKey, formatDate } from "@/lib/utils";

type ShiftplanCell = {
  id: string;
  date: string;
  slotIndex: number;
  controllerCode: string;
  rawCode: string;
};

type CodeDef = { id: string; code: string; label: string; color: string };

type ShiftplanFinalResponse = {
  bookings: Array<{ id: string; date: string; bookingTypeId: string; blocks: Array<{ start: string; end: string }> }>;
  cells: ShiftplanCell[];
  antraege: Array<{
    id: string;
    date: string;
    fromSlot: number;
    toSlot: number;
    type: "STOERUNG" | "MEETING";
    status: "PENDING" | "APPROVED" | "REJECTED";
  }>;
  days: Array<{
    date: string;
    booking?: string;
    bookingCode?: string;
    agreed: number;
    disagreed: number;
    A: number;
    P: number;
    antragSlots: number;
    antragTypes: string[];
    antragPendingSlots: number;
    antragPendingTypes: string[];
  }>;
};

const SLOT_START = 28; // 07:00
const SLOT_END = 76; // 18:45 end (exclusive 76 = up to slot 75)

function slotLabel(slotIndex: number): string {
  const m = slotIndex * 15;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function datesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const dim = new Date(y, m, 0).getDate();
  return Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export default function ShiftplanPage() {
  const auth = useRequireAuth(["AGENT"]);
  const { user } = useAuth();
  const t = useT();
  const [month, setMonth] = useState(currentMonthKey());

  const codes = useQuery({
    queryKey: ["shiftplan", "codes"],
    queryFn: () => api<CodeDef[]>("/shiftplan/codes", { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const final = useQuery({
    queryKey: ["shiftplan", "agent-final", month],
    queryFn: () => api<ShiftplanFinalResponse>(`/shiftplan/agent-final-month?month=${encodeURIComponent(month)}`, { token: auth.token ?? undefined }),
    enabled: !!auth.token,
  });

  const codeColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of codes.data ?? []) {
      m.set(c.code, c.color);
    }
    return m;
  }, [codes.data]);

  const cellsByDate = useMemo(() => {
    const map = new Map<string, Map<number, ShiftplanCell>>();
    for (const cell of final.data?.cells ?? []) {
      let inner = map.get(cell.date);
      if (!inner) {
        inner = new Map();
        map.set(cell.date, inner);
      }
      inner.set(cell.slotIndex, cell);
    }
    return map;
  }, [final.data?.cells]);

  const monthDates = useMemo(() => datesInMonth(month), [month]);
  const dayRows = useMemo(() => {
    const byDate = new Map((final.data?.days ?? []).map((d) => [d.date, d]));
    return monthDates.map((date) => ({ date, summary: byDate.get(date) }));
  }, [final.data?.days, monthDates]);

  const slotIndices = useMemo(() => Array.from({ length: SLOT_END - SLOT_START }, (_, i) => SLOT_START + i), []);

  if (auth.loading || !auth.token) {
    return <p className="p-6 text-muted-foreground">{t("app.loading")}</p>;
  }

  const payload = final.data;

  return (
    <>
      <PageHeader title={t("agentWorkspace.shiftplanTitle")} description={t("agentWorkspace.shiftplanSubtitle")} />

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("agentWorkspace.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label>{t("roster.day")}</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          <Button type="button" variant="secondary" onClick={() => void final.refetch()} disabled={final.isFetching}>
            <RefreshCw className={final.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {t("agentWorkspace.show")}
          </Button>
        </CardContent>
      </Card>

      {payload && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Zellen</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{payload.cells.length}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">A (freigegeben)</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{payload.days.reduce((s, d) => s + d.A, 0)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Differenzen</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{payload.days.reduce((s, d) => s + d.disagreed, 0)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Antrag (Slots)</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{payload.days.reduce((s, d) => s + d.antragSlots, 0)}</CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("agentWorkspace.shiftGrid")} ({slotLabel(SLOT_START)}–{slotLabel(SLOT_END - 1)})</CardTitle>
              <p className="text-xs text-muted-foreground">{t("agentWorkspace.shiftplanScrollHint")}</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="shiftplan-scroll-wrap ring-1 ring-border/40">
                <div className="shiftplan-scroll-inner">
                  <table className="shiftplan-grid w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="shiftplan-corner" scope="col">
                          Tag
                        </th>
                        {slotIndices.map((si) => {
                          const isHour = si % 4 === 0;
                          return (
                            <th
                              key={si}
                              className={cn(
                                "shiftplan-slot-head border-l border-border/70 px-1 py-2 text-center align-bottom font-medium leading-tight",
                                isHour ? "text-foreground" : "text-muted-foreground/70",
                              )}
                              scope="col"
                              title={slotLabel(si)}
                            >
                              {isHour ? (
                                <span className="block text-[11px] font-semibold tabular-nums">{slotLabel(si)}</span>
                              ) : (
                                <span className="block text-[10px] tabular-nums opacity-80">{slotLabel(si).slice(-2)}</span>
                              )}
                            </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map(({ date, summary }) => {
                      const rowMap = cellsByDate.get(date);
                      return (
                        <tr key={date} className="border-b border-border/60">
                          <td className="shiftplan-corner-cell">
                            {formatDate(date)}
                            <div className="mt-1 text-xs font-normal text-muted-foreground">
                              {summary?.booking ?? "—"}
                              {summary?.bookingCode ? ` · ${summary.bookingCode}` : ""}
                            </div>
                          </td>
                          {slotIndices.map((si) => {
                            const cell = rowMap?.get(si);
                            const code = cell?.controllerCode ?? "";
                            const agreed = cell && cell.controllerCode === cell.rawCode;
                            const bg = code ? (codeColors.get(code) ?? "#94a3b8") : "transparent";
                            return (
                              <td
                                key={si}
                                className={cn(
                                  "shiftplan-slot-cell border-l border-border/50 px-1 py-1.5 text-center text-xs font-semibold tabular-nums tracking-wide",
                                  !agreed && cell && "ring-1 ring-inset ring-destructive/70",
                                )}
                                style={
                                  code
                                    ? { backgroundColor: `${bg}40`, color: "var(--foreground)" }
                                    : { backgroundColor: "hsl(var(--muted) / 0.45)" }
                                }
                                title={cell ? `${slotLabel(si)} — ${code} (raw ${cell.rawCode})` : slotLabel(si)}
                              >
                                {code || ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Tagesübersicht</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Buchung</TableHead>
                    <TableHead className="text-right">A</TableHead>
                    <TableHead className="text-right">P</TableHead>
                    <TableHead className="text-right">Antrag</TableHead>
                    <TableHead className="text-right">Überein.</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.days.map((day) => (
                    <TableRow key={day.date}>
                      <TableCell>{formatDate(day.date)}</TableCell>
                      <TableCell>
                        {day.booking ?? "—"} {day.bookingCode ? `(${day.bookingCode})` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{day.A}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.P}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.antragSlots}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.agreed}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.disagreed}</TableCell>
                    </TableRow>
                  ))}
                  {payload.days.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        {t("app.noData")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("agentWorkspace.slot")}-Detail (max. 200)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Slot</TableHead>
                    <TableHead>Controlling</TableHead>
                    <TableHead>Raw</TableHead>
                    <TableHead>Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.cells.slice(0, 200).map((cell) => (
                    <TableRow key={cell.id}>
                      <TableCell>{cell.date}</TableCell>
                      <TableCell className="font-mono text-xs">
                        #{cell.slotIndex} {slotLabel(cell.slotIndex)}
                      </TableCell>
                      <TableCell>{cell.controllerCode}</TableCell>
                      <TableCell>{cell.rawCode}</TableCell>
                      <TableCell>{cell.controllerCode === cell.rawCode ? "✓" : "⚠"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
